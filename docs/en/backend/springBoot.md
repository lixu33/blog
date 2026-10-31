---
isTimeLine: true
sticky: 2
title: Spring Boot Auto-Configuration and Startup Process
description: Auto-configuration registration and filtering mechanisms, the effective order of condition annotations, key extension points in the startup process, and troubleshooting common failures after switching auto-configuration registration files from Spring Boot 2.x to 3.x.
date: 2023-07-15
updated: 2026-10-31
tags:
- Spring Boot
- Java
- Microservices
categories:
- Backend Technology
- Backend
- Backend Development
head:
- - meta
  - name: keywords
    content: Spring Boot,Auto-configuration,Conditional annotation,Startup process,AutoConfiguration.imports,Spring Boot 3
translatedFrom: 9a8ba9302dd9aff7
---
# Spring Boot Auto-configuration and Startup Flow

When Spring Boot configuration goes wrong, in most cases the cause can be found in the condition evaluations of auto-configuration. This article explains it in load order: first the four stages, then the startup flow, and finally common failures.

## The Four Stages of Auto-configuration

Spring Boot's "zero configuration" is the result of four steps chained together:

1. `@EnableAutoConfiguration` on `@SpringBootApplication` triggers the import
2. `AutoConfigurationImportSelector` reads all candidate auto-configuration classes
3. The `@Conditional` family of annotations filters out those that do not meet the conditions
4. The remaining ones are registered as bean definitions and then instantiated by the container

When troubleshooting "auto-configuration does not take effect", confirm segment by segment in this order; it is much faster than guessing from logs.

## 1. What `@EnableAutoConfiguration` Does

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

The key is `@Import(AutoConfigurationImportSelector.class)`: it implements `DeferredImportSelector` and is processed only at the very end, so **auto-configuration classes are always registered after the user's own configuration classes**.

This order determines override behavior: user-declared `@Bean`s enter the container first, and when `@ConditionalOnMissingBean` in auto-configuration is evaluated and finds one already present, it skips. So "why did my bean override the auto-configuration" and "why did auto-configuration not take effect" are actually two sides of the same mechanism.

### 1.1 Where Candidate Configuration Classes Come From (Key Difference Between 2.x and 3.x)

| Version | Registration File |
|---|---|
| Spring Boot 2.x | `META-INF/spring.factories`, with key `org.springframework.boot.autoconfigure.EnableAutoConfiguration` |
| Spring Boot 3.x | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, one class name per line |

In a 3.x project, continuing to use the 2.x `spring.factories` approach makes auto-configuration **silently not take effect**—there is no error, only missing beans. This is the most common problem when upgrading or building your own starter.

Note that `spring.factories` itself is not deprecated; extension points such as `ApplicationListener` and `EnvironmentPostProcessor` are still registered with it. Only auto-configuration classes have moved.

### 1.2 Conditional Annotations and Effective Order

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

Commonly used conditional annotations:

| Annotation | Meaning |
|---|---|
| `@ConditionalOnClass` | Takes effect only when the specified class exists on the classpath |
| `@ConditionalOnMissingBean` | Takes effect only when no bean of that type exists in the container |
| `@ConditionalOnProperty` | Takes effect only when the configuration property matches |
| `@ConditionalOnWebApplication` | Takes effect only in a web application |

The evaluation of `@ConditionalOnMissingBean` depends on **currently registered bean definitions**, so the order between auto-configuration classes directly affects the result. Use these three annotations to control order:

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@AutoConfiguration(before = JpaAutoConfiguration.class)
@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)  // 数值越小越早
```

If two auto-configuration classes both declare a bean of the same type and neither has `@ConditionalOnMissingBean`, the result depends on order and can easily become a startup error or behavior that drifts across versions.

## 2. Startup Flow

The main path of `SpringApplication.run()` (Spring Boot 3.x):

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

Several key points:

- **During the Environment preparation phase**, `EnvironmentPostProcessor` can be used to dynamically inject configuration (encrypted configuration and configuration centers hook in here)
- **`refresh()` is the moment singleton beans are actually created**; `@PostConstruct`, `InitializingBean`, and `ContextRefreshedEvent` all occur after or within it
- **`ApplicationRunner` and `CommandLineRunner` are mixed and sorted by `@Order`**, not one category finishing before the other starts
- Circular references have been prohibited by default since 2.6. When an old project fails to start with `BeanCurrentlyInCreationException`, `spring.main.allow-circular-references=true` only stops the bleeding; the cycle is still there

### 2.1 How to Locate Startup Time

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

After adding `spring-boot-starter-actuator`, access `/actuator/startup` to get the time consumed by each startup step. This is easier than scattering `System.nanoTime()` everywhere.

## 3. Core Annotations

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

It is equivalent to a combination of three annotations, and also supports properties such as `scanBasePackages` and `exclude` to override default behavior.

### Proxy Semantics of `@Configuration`

`@Configuration(proxyBeanMethods = true)` (the default) uses CGLIB to generate a subclass, ensuring that the same `@Bean` method returns the same instance when called multiple times. When set to `false`, no proxy is generated, and direct calls between methods will actually execute the method body multiple times—this is a common reason for "I clearly wrote `@Bean` but a new one is created every time."

The difference between `@Configuration` and `@Component` lies in this layer of proxying: the latter does not have it.

## 4. Practical Tips

1. **Custom starter**: Under 3.x, write auto-configuration classes to `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, and annotate the class with `@AutoConfiguration` instead of bare `@Configuration`
2. **Exclude a single auto-configuration**: `@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)`, or the configuration property `spring.autoconfigure.exclude`
3. **View active auto-configurations**: Start with `--debug`, and the log will print `Positive matches` / `Negative matches`, with the latter including the specific reason for not matching
4. **Configuration priority (low to high)**: `application.yml` → profile-specific file → environment variables → command-line arguments
5. **Custom Banner**: `resources/banner.txt`

## 5. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| Auto-configuration is not loaded at all | A 3.x project still writes it in `spring.factories` |
| Auto-configuration is loaded but the bean does not exist | Conditions are not met; use `--debug` to see the reason in `Negative matches` |
| The bean you want to override was not overridden successfully | Different method names cause two instances to coexist, or the auto-configuration class lacks `@ConditionalOnMissingBean` |
| Startup reports circular dependency | Prohibited by default in 2.6+; find the dependency cycle first instead of disabling the check |
| Startup is slow but you cannot see where | Enable the startup endpoint of actuator to see step timings |

## Related Reading

- [Spring Container, AOP, and Declarative Transaction Implementation](/en/backend/spring): Container, AOP, and Bean Lifecycle
- [Docker from Basics to Practice](/en/devops/docker): Building and Running Application Images
- [Kafka Storage and Replication Mechanisms](/en/backend/kafka): Message-Driven Services and Configuration
- [AES vs. RSA: How to Choose Between Symmetric and Asymmetric Encryption](/en/security/aes): How to Handle Keys and Sensitive Fields in Configuration

## References

- [Spring Boot Auto-configuration Official Documentation](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot 3.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide)
- [Spring Framework: Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)