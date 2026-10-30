---
isTimeLine: true
sticky: 2
title: Spring Boot Auto-Configuration and Startup Process
description: The auto-configuration registration and filtering mechanism, the order in which conditional annotations take effect, key extension points in the startup process, and troubleshooting common failures of auto-configuration after switching registration files from Spring Boot 2.x to 3.x.
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
    content: Spring Boot,Auto-configuration,Conditional annotations,Startup Process,AutoConfiguration.imports,Spring Boot 3
translatedFrom: c58db3394f0f4bc6
---
# Spring Boot Auto-Configuration and Startup Flow

Most Spring Boot configuration problems can be traced to condition evaluation in auto-configuration. This article follows the loading order: first the four stages, then the startup flow, and finally common failures.

## The Four Stages of Auto-Configuration

Spring Boot's “zero configuration” is the result of four steps chained together:

1. `@EnableAutoConfiguration` on `@SpringBootApplication` triggers the import
2. `AutoConfigurationImportSelector` reads all candidate auto-configuration classes
3. The `@Conditional` family of annotations filters out those that do not meet the conditions
4. The remaining ones are registered as bean definitions and then instantiated by the container

When troubleshooting “auto-configuration is not taking effect,” confirm each stage in this order; it is much faster than guessing from logs.

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

This order determines override behavior: user-declared `@Bean`s enter the container first; when `@ConditionalOnMissingBean` in auto-configuration is evaluated later, it finds they already exist and skips. Therefore, “why did my Bean override the auto-configuration?” and “why is the auto-configuration not taking effect?” are actually two sides of the same mechanism.

### 1.1 Where Candidate Configuration Classes Come From (Key Difference Between 2.x and 3.x)

| Version | Registration File |
|---|---|
| Spring Boot 2.x | `META-INF/spring.factories`, with the key `org.springframework.boot.autoconfigure.EnableAutoConfiguration` |
| Spring Boot 3.x | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, one class name per line |

In a 3.x project, continuing to use the 2.x `spring.factories` approach makes auto-configuration **silently fail to take effect**—there is no error, only missing beans. This is the most common problem when upgrading or building a custom starter.

Note that `spring.factories` itself is not deprecated; extension points such as `ApplicationListener` and `EnvironmentPostProcessor` are still registered through it. Only auto-configuration classes have moved.

### 1.2 Conditional Annotations and Evaluation Order

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

Common conditional annotations:

| Annotation | Meaning |
|---|---|
| `@ConditionalOnClass` | Takes effect only when the specified class is present on the classpath |
| `@ConditionalOnMissingBean` | Takes effect only when no bean of that type exists in the container |
| `@ConditionalOnProperty` | Takes effect only when the configuration property matches |
| `@ConditionalOnWebApplication` | Takes effect only in a web application |

`@ConditionalOnMissingBean` evaluates based on **currently registered bean definitions**, so the order between auto-configuration classes directly affects the result. Use these three annotations to control order:

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@AutoConfiguration(before = JpaAutoConfiguration.class)
@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)  // 数值越小越早
```

If two auto-configuration classes both declare a bean of the same type and neither adds `@ConditionalOnMissingBean`, the result depends on order, which can easily lead to startup errors or behavior that drifts across versions.

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

- **During Environment preparation**, `EnvironmentPostProcessor` can be used to inject configuration dynamically (encrypted configuration and configuration centers hook in here)
- **`refresh()` is when singleton beans are actually created**; `@PostConstruct`, `InitializingBean`, and `ContextRefreshedEvent` occur after or during this
- **`ApplicationRunner` and `CommandLineRunner` are sorted together by `@Order` and executed interleaved**, not one type completely before the other
- Since 2.6, circular references are prohibited by default. When an old project reports `BeanCurrentlyInCreationException` at startup, `spring.main.allow-circular-references=true` only stops the bleeding; the cycle is still there

### 2.1 How to Locate Startup Time Consumption

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

After adding `spring-boot-starter-actuator`, access `/actuator/startup` to get the time consumed by each startup step. This is more convenient than scattering `System.nanoTime()` calls everywhere.

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

Equivalent to the combination of three annotations, and also supports properties such as `scanBasePackages` and `exclude` to override default behavior.

### Proxy Semantics of `@Configuration`

`@Configuration(proxyBeanMethods = true)` (the default) generates a subclass with CGLIB to ensure that the same `@Bean` method returns the same instance when called multiple times. When set to `false`, no proxy is generated, and direct calls between methods will actually execute the method body multiple times—this is the common reason why “I clearly wrote `@Bean`, but it creates a new instance every time.”

The difference between `@Configuration` and `@Component` lies in this proxy layer: the latter does not have it.

## 4. Practical Tips

1. **Custom starter**: In 3.x, write the auto-configuration class to `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, and annotate the class with `@AutoConfiguration` instead of bare `@Configuration`
2. **Exclude a single auto-configuration**: `@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)`, or the property `spring.autoconfigure.exclude`
3. **View active auto-configurations**: Start with `--debug`, and the log prints `Positive matches` / `Negative matches`; the latter includes the specific reason for non-matching
4. **Configuration priority (low to high)**: `application.yml` → profile-specific file → environment variables → command-line arguments
5. **Custom Banner**: `resources/banner.txt`

## 5. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| Auto-configuration not loaded at all | The 3.x project still writes it in `spring.factories` |
| Auto-configuration loaded but bean missing | Conditions not met; use `--debug` to see the reason in `Negative matches` |
| The bean you wanted to override was not overridden | Different method names cause two instances to coexist, or the auto-configuration class lacks `@ConditionalOnMissingBean` |
| Startup reports circular dependency | Prohibited by default since 2.6; find the dependency cycle instead of disabling the check |
| Startup is slow but you cannot see where | Enable the actuator startup endpoint to see step timings |

## References

- [Official Spring Boot auto-configuration documentation](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot 3.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide)
- [Spring Framework: Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)