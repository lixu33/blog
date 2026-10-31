---
isTimeLine: true
sticky: 2
title: Spring Boot 自动配置与启动流程
description: 自动配置的注册与筛选机制、条件注解的生效顺序、启动流程的关键扩展点，以及 Spring Boot 2.x 到 3.x 更换自动配置注册文件后常见的不生效问题排查。
date: 2023-07-15
updated: 2026-10-31
tags:
- Spring Boot
- Java
- 微服务
categories:
- 后端技术
- Backend
- 后端开发
head:
- - meta
  - name: keywords
    content: Spring Boot,自动配置,条件注解,启动流程,AutoConfiguration.imports,Spring Boot 3
---

# Spring Boot 自动配置与启动流程

Spring Boot 的配置出问题，多数情况可以在自动配置的条件判断里找到原因。这篇按加载顺序讲：先看四个环节，再讲启动流程，最后列常见故障。

## 自动配置的四个环节

Spring Boot 的「零配置」是四步串起来的结果：

1. `@SpringBootApplication` 上的 `@EnableAutoConfiguration` 触发导入
2. `AutoConfigurationImportSelector` 读取所有候选自动配置类
3. 用 `@Conditional` 系列注解筛掉不满足条件的
4. 剩下的注册成 Bean 定义，再由容器实例化

排查「自动配置没生效」时按这个顺序逐段确认，比看日志猜快得多。

## 一、`@EnableAutoConfiguration` 做了什么

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {
}
```

关键是 `@Import(AutoConfigurationImportSelector.class)`：它实现了 `DeferredImportSelector`，延迟到最后才处理，因此**自动配置类总是在用户自己的配置类之后注册**。

这个顺序决定了覆盖行为：用户声明的 `@Bean` 先入容器，自动配置里的 `@ConditionalOnMissingBean` 再判断时发现已存在，就跳过。所以「为什么我的 Bean 覆盖了自动配置」和「为什么自动配置没生效」其实是同一机制的两面。

### 1.1 候选配置类从哪来（2.x 与 3.x 的关键差异）

| 版本 | 注册文件 |
|---|---|
| Spring Boot 2.x | `META-INF/spring.factories`，键为 `org.springframework.boot.autoconfigure.EnableAutoConfiguration` |
| Spring Boot 3.x | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，一行一个类名 |

在 3.x 项目里沿用 2.x 的 `spring.factories` 写法，自动配置会**静默不生效**——没有报错，只是 Bean 不存在。这是升级或自建 starter 时最常见的问题。

注意 `spring.factories` 本身没有废弃，`ApplicationListener`、`EnvironmentPostProcessor` 等扩展点仍用它注册，只有自动配置类换了位置。

### 1.2 条件注解与生效顺序

```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public DataSource dataSource() {
        // ...
    }
}
```

常用条件注解：

| 注解 | 含义 |
|---|---|
| `@ConditionalOnClass` | classpath 存在指定类才生效 |
| `@ConditionalOnMissingBean` | 容器里没有该类型 Bean 才生效 |
| `@ConditionalOnProperty` | 配置项匹配才生效 |
| `@ConditionalOnWebApplication` | 仅在 Web 应用中生效 |

`@ConditionalOnMissingBean` 的判定依赖**当前已注册的 Bean 定义**，所以自动配置类之间的先后顺序会直接影响结果。控制顺序用这三个注解：

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@AutoConfiguration(before = JpaAutoConfiguration.class)
@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)  // 数值越小越早
```

如果两个自动配置类都声明了同类型 Bean 又都没加 `@ConditionalOnMissingBean`，结果取决于顺序，容易变成启动报错或行为随版本漂移。

## 二、启动流程

`SpringApplication.run()` 的主干（Spring Boot 3.x）：

```java
public ConfigurableApplicationContext run(String... args) {
    StartupInfo startupInfo = StartupInfo.getStarted();
    try {
        // 1. 创建 BootstrapContext（3.x 新增，供 AOT / 懒加载使用）
        // 2. 准备 Environment：加载配置、触发 EnvironmentPostProcessor
        // 3. 打印 Banner、创建 ApplicationContext
        // 4. prepareContext：执行 ApplicationContextInitializer、注册主类 Bean 定义
        // 5. refreshContext：调用 AbstractApplicationContext.refresh()，创建单例 Bean
        // 6. callRunners：执行 ApplicationRunner / CommandLineRunner
    } catch (Throwable ex) {
        handleRunFailure(context, ex, listeners);
        throw new IllegalStateException(ex);
    }
}
```

几个关键节点：

- **Environment 准备阶段**可以用 `EnvironmentPostProcessor` 动态注入配置（加密配置、配置中心就挂在这里）
- **`refresh()` 是真正创建单例 Bean 的时刻**，`@PostConstruct`、`InitializingBean`、`ContextRefreshedEvent` 都在这之后或之中
- **`ApplicationRunner` 与 `CommandLineRunner` 按 `@Order` 混合排序执行**，不是先跑完一类再跑另一类
- 2.6 起默认禁止循环引用，老项目启动报 `BeanCurrentlyInCreationException` 时，`spring.main.allow-circular-references=true` 只是止血，环还在

### 2.1 启动耗时怎么定位

```yaml
management:
  endpoint:
    startup:
      enabled: true
  endpoints:
    web:
      exposure:
        include: startup
```

加 `spring-boot-starter-actuator` 后访问 `/actuator/startup`，会给出每个启动步骤的耗时，比到处打 `System.nanoTime()` 省事。

## 三、核心注解

### `@SpringBootApplication`

```java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = {
    @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class),
    @Filter(type = FilterType.CUSTOM, classes = AutoConfigurationExcludeFilter.class)
})
public @interface SpringBootApplication {
}
```

等价于三个注解的组合，同时支持 `scanBasePackages`、`exclude` 等属性覆盖默认行为。

### `@Configuration` 的代理语义

`@Configuration(proxyBeanMethods = true)`（默认）会用 CGLIB 生成子类，保证同一个 `@Bean` 方法被多次调用时返回同一个实例。设为 `false` 后不生成代理，方法间直接调用就会真的执行多次方法体——这是「明明写了 `@Bean` 却每次都 new 一个」的常见原因。

`@Configuration` 与 `@Component` 的差别就在这层代理：后者没有。

## 四、实用技巧

1. **自定义 starter**：3.x 下自动配置类写到 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，类上标 `@AutoConfiguration` 而不是裸的 `@Configuration`
2. **排除单个自动配置**：`@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)`，或配置项 `spring.autoconfigure.exclude`
3. **查看生效的自动配置**：启动加 `--debug`，日志会打印 `Positive matches` / `Negative matches`，后者附不匹配的具体原因
4. **配置优先级（低到高）**：`application.yml` → profile 专属文件 → 环境变量 → 命令行参数
5. **自定义 Banner**：`resources/banner.txt`

## 五、常见故障对照

| 现象 | 常见原因 |
|---|---|
| 自动配置完全没加载 | 3.x 项目还写在 `spring.factories` |
| 自动配置加载了但 Bean 不存在 | 条件不满足，`--debug` 看 `Negative matches` 的原因 |
| 想覆盖的 Bean 没覆盖成功 | 方法名不同导致两个实例并存，或自动配置类没加 `@ConditionalOnMissingBean` |
| 启动报循环依赖 | 2.6+ 默认禁止，先找依赖环而不是关检查 |
| 启动慢但看不出哪慢 | 开 actuator 的 startup 端点看步骤耗时 |

## 相关阅读

- [Spring 容器、AOP 与声明式事务的实现](/backend/spring)：容器、AOP 与 Bean 生命周期
- [Docker 从入门到实践](/devops/docker)：应用镜像的构建与运行
- [Kafka 存储与复制机制](/backend/kafka)：消息驱动的服务与配置
- [AES 与 RSA：对称与非对称加密怎么选](/security/aes)：配置里的密钥与敏感字段怎么处理

## 参考

- [Spring Boot 自动配置官方文档](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot 3.0 迁移指南](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide)
- [Spring Framework：容器扩展点](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)
