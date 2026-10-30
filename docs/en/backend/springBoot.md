---
isTimeLine: true
sticky: 2
title: Spring Boot Auto-Configuration and Startup Process
description: Auto-configuration registration and filtering mechanisms, condition annotation precedence, key extension points in the startup process, and troubleshooting common failures after the auto-configuration registration file change from Spring Boot 2.x to 3.x.
date: 2023-07-15
updated: 2026-10-31
tags:
- Spring Boot
- Java
- Microservices
categories:
- Backend Technologies
- Backend
- Backend Development
head:
- - meta
  - name: keywords
    content: Spring Boot,Auto-configuration,Conditional annotations,Startup Process,AutoConfiguration.imports,Spring Boot 3
translatedFrom: 14108c992fa0a166
---
“Why isn’t my configuration taking effect?”—most Spring Boot problems can be attributed to conditional evaluation in auto-configuration.

It’s not magic; it just chains four steps together. Once the order is clear, troubleshooting becomes a section-by-section confirmation rather than digging through logs and guessing.

## The Four Stages of Auto-Configuration

Spring Boot’s “zero configuration” is the result of four steps chained together:

1. `@EnableAutoConfiguration` on `@SpringBootApplication` triggers the import
2. `AutoConfigurationImportSelector` reads all candidate auto-configuration classes
3. The `@Conditional` family of annotations filters out those whose conditions are not met
4. The rest are registered as bean definitions and then instantiated by the container

When troubleshooting “auto-configuration isn’t taking effect,” confirm each stage in this order; it’s much faster than guessing from logs.

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

The key is `@Import(AutoConfigurationImportSelector.class)`: it implements `DeferredImportSelector` and is processed only at the very end, so **auto-configuration classes are always registered after the user’s own configuration classes**.

This order determines override behavior: user-declared `@Bean`s enter the container first, and when `@ConditionalOnMissingBean` in auto-configuration is evaluated, it sees they already exist and skips. So “why did my bean override auto-configuration” and “why didn’t auto-configuration take effect” are actually two sides of the same mechanism.

### 1.1 Where Candidate Configuration Classes Come From (Key Difference Between 2.x and 3.x)

| Version | Registration File |
|---|---|
| Spring Boot 2.x | `META-INF/spring.factories`, with the key `org.springframework.boot.autoconfigure.EnableAutoConfiguration` |
| Spring Boot 3.x | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, one class name per line |

If a 3.x project continues to use the 2.x `spring.factories` approach, auto-configuration will **silently fail to take effect**—no error, just no bean. This is the most common problem when upgrading or building your own starter.

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

Commonly used conditional annotations:

| Annotation | Meaning |
|---|---|
| `@ConditionalOnClass` | Takes effect only if the specified class exists on the classpath |
| `@ConditionalOnMissingBean` | Takes effect only if no bean of that type exists in the container |
| `@ConditionalOnProperty` | Takes effect only if the configuration property matches |
| `@ConditionalOnWebApplication` | Takes effect only in a web application |

The evaluation of `@ConditionalOnMissingBean` depends on **the bean definitions currently registered**, so the order of auto-configuration classes directly affects the result. Use these three annotations to control order:

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@AutoConfiguration(before = JpaAutoConfiguration.class)
@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)  // 数值越小越早
```

If two auto-configuration classes both declare beans of the same type and neither adds `@ConditionalOnMissingBean`, the result depends on order and can easily become a startup error or behavior that drifts across versions.

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

- **During the Environment preparation phase**, you can dynamically inject configuration with `EnvironmentPostProcessor` (encrypted configuration and configuration centers hook in here)
- **`refresh()` is when singleton beans are actually created**; `@PostConstruct`, `InitializingBean`, and `ContextRefreshedEvent` all occur during or after this
- **`ApplicationRunner` and `CommandLineRunner` are mixed and sorted by `@Order`**, not run all of one type first and then the other
- Circular references are prohibited by default since 2.6. When an old project fails to start with `BeanCurrentlyInCreationException`, `spring.main.allow-circular-references=true` only stops the bleeding; the cycle is still there

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

After adding `spring-boot-starter-actuator`, access `/actuator/startup` to get the time spent on each startup step. It’s more convenient than scattering `System.nanoTime()` everywhere.

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

Equivalent to a combination of three annotations, and also supports attributes such as `scanBasePackages` and `exclude` to override default behavior.

### Proxy Semantics of `@Configuration`

`@Configuration(proxyBeanMethods = true)` (the default) uses CGLIB to generate a subclass, ensuring that the same `@Bean` method returns the same instance when called multiple times. When set to `false`, no proxy is generated, and direct calls between methods will actually execute the method body multiple times—this is a common reason for “I clearly wrote `@Bean`, but it creates a new one every time.”

The difference between `@Configuration` and `@Component` lies in this proxy layer: the latter does not have it.

## 4. Practical Tips

1. **Custom starter**: In 3.x, write auto-configuration classes into `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, and annotate the class with `@AutoConfiguration` rather than plain `@Configuration`
2. **Exclude a single auto-configuration**: `@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)`, or the configuration property `spring.autoconfigure.exclude`
3. **View active auto-configuration**: Start with `--debug`, and the log will print `Positive matches` / `Negative matches`; the latter includes the specific reason for the mismatch
4. **Configuration priority (low to high)**: `application.yml` → profile-specific file → environment variables → command-line arguments
5. **Custom Banner**: `resources/banner.txt`

## 5. Common Troubleshooting Reference

| Symptom | Common Cause |
|---|---|
| Auto-configuration not loaded at all | 3.x project still writes it in `spring.factories` |
| Auto-configuration loaded but bean does not exist | Condition not met; use `--debug` to see the reason in `Negative matches` |
| The bean you wanted to override was not overridden successfully | Different method names cause two instances to coexist, or the auto-configuration class lacks `@ConditionalOnMissingBean` |
| Startup reports circular dependency | Prohibited by default in 2.6+; find the dependency cycle instead of disabling the check |
| Startup is slow but you can’t see where | Enable the actuator startup endpoint to see step timings |

## References

- [Official Spring Boot Auto-Configuration Documentation](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot 3.0 Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide)
- [Spring Framework: Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html)