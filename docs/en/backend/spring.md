---
isTimeLine: true
title: Implementation of the Spring Container, AOP, and Declarative Transactions
description: A twelve-step breakdown of Spring container startup along refresh(), covering the Bean callback order from instantiation to destruction, why AOP proxies are created only after initialization, the Advisor structure of declarative transactions and their failure conditions, and the DispatcherServlet request-handling chain.
date: 2024-06-28
updated: 2026-10-31
tags:
- Spring
- Source Code Analysis
- IoC
- AOP
categories:
- Backend Technology
- Backend
- Backend Development
head:
- - meta
  - name: keywords
    content: Spring Source Code,IoC container,AOP Implementation,Transaction management,SpringMVC Principles,Java Framework,Bean lifecycle,refresh,TransactionInterceptor
translatedFrom: edac1b12b7b5b9db
---
# Spring Container, AOP, and Declarative Transaction Implementation

In projects, most “annotation not taking effect” problems occur because the container has not reached that stage yet: `@Autowired` being null means the Bean has not yet been processed by the post-processor; `@Transactional` not taking effect usually means the call did not go through the proxy; not being able to get another Bean in `@PostConstruct` is a dependency order issue. Once the order of these steps is clear, troubleshooting has a starting point.

Below, first walk through the startup flow of `refresh()`, then explain the callback order in the Bean lifecycle, the timing of AOP proxy generation, then the assembly method and failure conditions of declarative transactions, and finally the chain of `DispatcherServlet` handling a request.

## First Look at the Three Main Lines

| Mechanism | Focus | Symptom When a Problem Occurs |
|---|---|---|
| IoC container | twelve steps of `refresh()` | Bean definitions not loaded, dependency injection is null |
| AOP | `postProcessAfterInitialization` | aspect not effective, proxy type incorrect |
| Declarative transactions | `TransactionInterceptor` | exception not rolled back, transaction scope exceeds expectation |

The common premise of the three lines is: starting from Spring 6, JDK 17 is required, and all `javax.*` are replaced with `jakarta.*` (Spring Boot 3 corresponds). Mixing the two namespaces in an old project will result in “class not found” rather than a configuration error.

## I. IoC Container

### Interface Layering

`BeanFactory` is the minimal contract, only responsible for getting Beans:

```java
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(String name, Class<T> requiredType) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
}
```

`ApplicationContext` layers resource loading, event publishing, internationalization, and environment abstraction on top of it:

```java
public interface ApplicationContext extends EnvironmentCapable, ListableBeanFactory,
        HierarchicalBeanFactory, MessageSource, ApplicationEventPublisher, ResourcePatternResolver {
}
```

The difference is that `BeanFactory` is lazy-loaded, while `ApplicationContext` creates all singletons when `refresh()` ends. Slow startup and errors at startup both come from this.

### The Twelve Steps of refresh()

This code is in `AbstractApplicationContext`, not in `AnnotationConfigApplicationContext`—the latter is only responsible for registering `AnnotatedBeanDefinitionReader` and `ClassPathBeanDefinitionScanner`, and the refresh logic is completed by the parent class:

```java
public void refresh() throws BeansException, IllegalStateException {
    synchronized (this.startupShutdownMonitor) {
        prepareRefresh();                                    // 1 记录启动时间、校验环境
        ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory(); // 2 建 BeanFactory
        prepareBeanFactory(beanFactory);                     // 3 注册内置依赖
        try {
            postProcessBeanFactory(beanFactory);             // 4 子类扩展
            invokeBeanFactoryPostProcessors(beanFactory);    // 5 处理 Bean 定义（@Configuration 在此解析）
            registerBeanPostProcessors(beanFactory);         // 6 注册 BeanPostProcessor
            initMessageSource();                             // 7 国际化
            initApplicationEventMulticaster();               // 8 事件广播器
            onRefresh();                                     // 9 子类扩展（Web 容器在此建 Tomcat）
            registerListeners();                             // 10 注册监听器
            finishBeanFactoryInitialization(beanFactory);    // 11 实例化所有非懒加载单例
            finishRefresh();                                 // 12 发布 ContextRefreshedEvent
        } catch (BeansException ex) {
            destroyBeans();
            cancelRefresh(ex);
            throw ex;
        }
    }
}
```

Two key orders:

- Step 5 is before step 6. `BeanFactoryPostProcessor` modifies Bean definitions (metadata); at this point there are not yet any business Bean instances.
- Step 11 is when object creation begins. All `@Autowired` injection, `@PostConstruct` callbacks, and AOP proxy weaving happen in this call.

### Three Extension Points

```java
public interface BeanFactoryPostProcessor {
    void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;
}
```

```java
public interface BeanPostProcessor {
    @Nullable
    default Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        return bean;
    }
    @Nullable
    default Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        return bean;
    }
}
```

`ApplicationListener` listens to container events, and `ContextRefreshedEvent` is emitted at step 12, when all singletons are available.

When customizing `BeanPostProcessor`, note: it itself will be instantiated early; if it depends on another Bean, that Bean will also be created early, possibly bypassing some post-processing.

### Annotation Parsing Path

The processing chain for annotations such as `@Component` is: `ClassPathBeanDefinitionScanner` scans → `ClassPathScanningCandidateComponentProvider` matches by `@Component` and its derived annotations → generates a `BeanDefinition` and registers it into the container. `@Configuration` is handled by `ConfigurationClassPostProcessor` (it is itself a `BeanFactoryPostProcessor` and takes effect at step 5), and `@Autowired` is handled by `AutowiredAnnotationBeanPostProcessor`.

The latter's declaration changed after 5.3, and `InstantiationAwareBeanPostProcessorAdapter` has been deprecated and removed in 6.0:

```java
public class AutowiredAnnotationBeanPostProcessor
        implements SmartInstantiationAwareBeanPostProcessor, MergedBeanDefinitionPostProcessor,
                   PriorityOrdered, BeanFactoryAware {

    @Override
    public PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName) {
        InjectionMetadata metadata = findAutowiringMetadata(beanName, bean.getClass(), pvs);
        try {
            metadata.inject(bean, beanName, pvs);
        } catch (BeanCreationException ex) {
            throw ex;
        } catch (Throwable ex) {
            throw new BeanCreationException(beanName, "Injection of autowired dependencies failed", ex);
        }
        return pvs;
    }
}
```

### Bean Lifecycle

`doCreateBean` splits object creation into three sections:

```java
protected Object doCreateBean(String beanName, RootBeanDefinition mbd, @Nullable Object[] args) {
    BeanWrapper instanceWrapper = createBeanInstance(beanName, mbd, args);  // 构造/工厂方法
    Object bean = instanceWrapper.getWrappedInstance();
    exposeEarlyReference(beanName, bean, mbd);          // 三级缓存，解决循环依赖

    populateBean(beanName, mbd, instanceWrapper);       // 属性注入
    Object exposedObject = bean;
    exposedObject = initializeBean(beanName, exposedObject, mbd);  // 初始化回调
    return exposedObject;
}
```

The order inside `initializeBean` is fixed:

1. `BeanNameAware` / `BeanClassLoaderAware` / `BeanFactoryAware` and other `*Aware` callbacks
2. All `BeanPostProcessor.postProcessBeforeInitialization`
3. `@PostConstruct` → `InitializingBean.afterPropertiesSet()` → `init-method`
4. All `BeanPostProcessor.postProcessAfterInitialization` (**the AOP proxy is generated at this step**)

During destruction, `@PreDestroy`, `DisposableBean.destroy()`, and `destroy-method` are executed in sequence.

## II. AOP

### The Proxy Is Generated Only After Initialization

A common misunderstanding is that “the proxy is applied after instantiation and before initialization.” The actual order is determined by `AbstractAutoProxyCreator`, which implements `postProcessAfterInitialization`:

```java
public abstract class AbstractAutoProxyCreator extends ProxyProcessorSupport
        implements SmartInstantiationAwareBeanPostProcessor, BeanFactoryAware {

    @Override
    public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
        if (bean != null) {
            Object cacheKey = getCacheKey(bean.getClass(), beanName);
            if (this.earlyProxyReferences.remove(cacheKey) != bean) {
                return wrapIfNecessary(bean, beanName, cacheKey);
            }
        }
        return bean;
    }

    protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
        Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
        if (specificInterceptors != DO_NOT_PROXY) {
            this.advisedBeans.put(cacheKey, Boolean.TRUE);
            Object proxy = createProxy(bean.getClass(), beanName, specificInterceptors,
                    new SingletonTargetSource(bean));
            this.proxyTypes.put(cacheKey, proxy.getClass());
            return proxy;
        }
        this.advisedBeans.put(cacheKey, Boolean.FALSE);
        return bean;
    }
}
```

Two inferences follow from this:

- The method executed inside `@PostConstruct` runs on the original object; there is no proxy yet, so self-invocation inside the method cannot be intercepted by the aspect.
- What is returned to the container is the proxy object, and whatever is injected elsewhere later is the proxy; but `this` inside the Bean always points to the original object.

### JDK Dynamic Proxy and CGLIB

`ProxyFactory.getProxy()` ultimately delegates to the two implementations of `AopProxy`:

| Condition | Implementation | Limitation |
|---|---|---|
| Target class implements an interface | `JdkDynamicAopProxy` | can only be called through the interface; use the interface type when injecting |
| No interface | `CglibAopProxy` | cannot proxy final classes and final methods |

Starting from Spring Boot 2.x, `spring.aop.proxy-target-class` defaults to `true`, that is, CGLIB is used unconditionally, so “inject by interface” is usually no longer necessary in Boot projects. CGLIB has been repackaged into `spring-core` (`org.springframework.cglib`), and there is no need to additionally introduce the `cglib` dependency—adding it explicitly may instead run into an old version incompatible with the JDK.

### Proxy Object and Self-Invocation

`JdkDynamicAopProxy.invoke` retrieves the interceptor chain for that method; an empty chain directly invokes via reflection, while a non-empty chain goes through `ReflectiveMethodInvocation.proceed()`:

```java
List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
if (chain.isEmpty()) {
    retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
} else {
    invocation = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
    retVal = invocation.proceed();
}
```

This is the mechanism source of self-invocation failure: `this.method()` does not go through `proxy.invoke`, so the chain is never retrieved. To bypass this, inject the self proxy, use `AopContext.currentProxy()` (requires `exposeProxy=true`), or split the method into another Bean.

## 3. Declarative Transactions

### Assembly

`@EnableTransactionManagement` imports `ProxyTransactionManagementConfiguration`, which produces three things:

```java
@Bean(name = TransactionManagementConfigUtils.TRANSACTION_ADVISOR_BEAN_NAME)
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public BeanFactoryTransactionAttributeSourceAdvisor transactionAdvisor() {
    BeanFactoryTransactionAttributeSourceAdvisor advisor = new BeanFactoryTransactionAttributeSourceAdvisor();
    advisor.setTransactionAttributeSource(transactionAttributeSource());
    advisor.setAdvice(transactionInterceptor());
    advisor.setOrder(this.enableTx.<Integer>getNumber("order"));
    return advisor;
}
```

- `AnnotationTransactionAttributeSource` parses the `@Transactional` attributes on methods
- `TransactionInterceptor` is a `MethodInterceptor` responsible for opening, committing, and rolling back before and after the invocation
- The Advisor binds the two together, making them a candidate interceptor for `AbstractAutoProxyCreator`

The interception logic itself is in `TransactionAspectSupport.invokeWithinTransaction`:

```java
protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
        final InvocationCallback invocation) throws Throwable {
    TransactionAttributeSource tas = getTransactionAttributeSource();
    final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
    final PlatformTransactionManager tm = determineTransactionManager(txAttr);
    // 开启事务 → invocation.proceed() → 按返回/异常提交或回滚
}
```

### Conditions Under Which Transactions Do Not Take Effect

| Scenario | Cause |
|---|---|
| Internal call within the same class | Does not go through the proxy, so the interceptor chain is not executed |
| Method is private or final | The proxy cannot override it, and CGLIB cannot override final either |
| Exception is swallowed by try-catch | The interceptor does not see the exception and commits as a normal return |
| Checked exception is thrown | By default, rollback only occurs for `RuntimeException` and `Error` |

The fourth point requires explicit declaration with `@Transactional(rollbackFor = Exception.class)`. In addition, `propagation = REQUIRES_NEW` will actually open a new connection; when called within an existing transaction, watch out for connection pool exhaustion.

## 4. Spring MVC Request Flow

The main path in `DispatcherServlet.doDispatch` has only four steps:

```java
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
    mappedHandler = getHandler(processedRequest);              // 1 由 HandlerMapping 定位处理器
    HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());  // 2 选适配器
    mv = ha.handle(processedRequest, response, mappedHandler.getHandler());  // 3 执行
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);  // 4 渲染
}
```

- `HandlerMapping` maps URL → handler; `RequestMappingHandlerMapping` handles annotation-based Controllers
- `HandlerAdapter` handles differences in invocation styles; `RequestMappingHandlerAdapter` performs argument resolution (`HandlerMethodArgumentResolver`) and return value handling (`HandlerMethodReturnValueHandler`)
- `ViewResolver` only participates when returning a view name; `@ResponseBody` goes through `HttpMessageConverter` and does not go through view resolution

Before step 4, `HandlerInterceptor`'s `preHandle` / `postHandle` / `afterCompletion` are also executed; exceptions ultimately land in `HandlerExceptionResolver`, and `@ControllerAdvice`'s `@ExceptionHandler` is invoked at this stage.

## Related Reading

- [Spring Boot Auto-configuration and Startup Flow](/en/backend/springBoot): How auto-configuration and startup flow are built on top of the container
- [JNA: Practice of Calling Native Libraries from Java](/en/backend/jna): Choosing between JNI/JNA when you need to call native libraries
- [Redis Principles and High-Availability Solutions](/en/backend/redis): The data structures behind Spring's cache abstraction
- [Netty's Event Loop, Pipeline, and Zero-Copy](/en/backend/netty): How the Reactor model is implemented in Netty