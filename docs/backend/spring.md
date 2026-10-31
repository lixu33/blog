---
isTimeLine: true
title: Spring 容器、AOP 与声明式事务的实现
description: 沿 refresh() 十二步拆解 Spring 容器启动，说明 Bean 从实例化到销毁的回调顺序、AOP 代理在初始化之后才生成的原因、声明式事务的 Advisor 结构与失效条件，以及 DispatcherServlet 处理一次请求的链路。
date: 2024-06-28
updated: 2026-10-31
tags:
- Spring
- 源码分析
- IoC
- AOP
categories:
- 后端技术
- Backend
- 后端开发
head:
- - meta
  - name: keywords
    content: Spring源码,IoC容器,AOP实现,事务管理,SpringMVC原理,Java框架,Bean生命周期,refresh,TransactionInterceptor
---

# Spring 容器、AOP 与声明式事务的实现

项目里「注解没生效」的问题，大多出在容器还没走到那个阶段：`@Autowired` 为 null 说明 Bean 尚未被后处理器处理，`@Transactional` 不生效通常是调用没经过代理，`@PostConstruct` 里拿不到别的 Bean 则是依赖顺序问题。把这几步的先后理清，排查就有落点。

下面先串一遍 `refresh()` 的启动流程，再讲 Bean 生命周期里的回调顺序、AOP 代理的生成时机，然后是声明式事务的组装方式与失效条件，最后是 `DispatcherServlet` 处理一次请求的链路。

## 先看三条主线

| 机制 | 落点 | 出问题时的表现 |
|---|---|---|
| IoC 容器 | `refresh()` 十二步 | Bean 定义没加载、依赖注入为 null |
| AOP | `postProcessAfterInitialization` | 切面不生效、代理类型不对 |
| 声明式事务 | `TransactionInterceptor` | 抛异常未回滚、事务范围超出预期 |

三条线的共同前提是：Spring 6 起要求 JDK 17，`javax.*` 全部换成 `jakarta.*`（Spring Boot 3 对应）。在老项目里混用两套命名空间，会得到「类找不到」而不是配置错误。

## 一、IoC 容器

### 接口分层

`BeanFactory` 是最小契约，只负责拿 Bean：

```java
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(String name, Class<T> requiredType) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
}
```

`ApplicationContext` 在它之上叠加了资源加载、事件发布、国际化、环境抽象：

```java
public interface ApplicationContext extends EnvironmentCapable, ListableBeanFactory,
        HierarchicalBeanFactory, MessageSource, ApplicationEventPublisher, ResourcePatternResolver {
}
```

区别在于 `BeanFactory` 是懒加载的，`ApplicationContext` 在 `refresh()` 结束时会把所有单例都建出来。启动慢、启动即报错，都来自这一点。

### refresh() 的十二步

这段代码在 `AbstractApplicationContext`，不在 `AnnotationConfigApplicationContext`——后者只负责注册 `AnnotatedBeanDefinitionReader` 和 `ClassPathBeanDefinitionScanner`，刷新逻辑由父类完成：

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

两个关键顺序：

- 第 5 步在第 6 步之前。`BeanFactoryPostProcessor` 改的是 Bean 定义（元数据），此时还没有任何业务 Bean 实例。
- 第 11 步才开始造对象。所有 `@Autowired` 的注入、`@PostConstruct` 的回调、AOP 代理的织入，都发生在这一次调用里。

### 三个扩展点

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

`ApplicationListener` 监听容器事件，`ContextRefreshedEvent` 在第 12 步发出，此时所有单例可用。

自定义 `BeanPostProcessor` 时要注意：它本身会被提前实例化，如果它依赖别的 Bean，那个 Bean 也会被提前创建，可能绕过某些后处理。

### 注解的解析路径

`@Component` 一类注解的处理链条是：`ClassPathBeanDefinitionScanner` 扫描 → `ClassPathScanningCandidateComponentProvider` 按 `@Component` 及其派生注解匹配 → 生成 `BeanDefinition` 注册进容器。`@Configuration` 由 `ConfigurationClassPostProcessor` 处理（它本身是 `BeanFactoryPostProcessor`，在第 5 步生效），`@Autowired` 由 `AutowiredAnnotationBeanPostProcessor` 处理。

后者的声明在 5.3 之后变了，`InstantiationAwareBeanPostProcessorAdapter` 已废弃并在 6.0 移除：

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

### Bean 的生命周期

`doCreateBean` 把造对象拆成三段：

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

`initializeBean` 内部的顺序是固定的：

1. `BeanNameAware` / `BeanClassLoaderAware` / `BeanFactoryAware` 等 `*Aware` 回调
2. 所有 `BeanPostProcessor.postProcessBeforeInitialization`
3. `@PostConstruct` → `InitializingBean.afterPropertiesSet()` → `init-method`
4. 所有 `BeanPostProcessor.postProcessAfterInitialization`（**AOP 代理在这一步生成**）

销毁时依次走 `@PreDestroy`、`DisposableBean.destroy()`、`destroy-method`。

## 二、AOP

### 代理是在初始化之后才生成的

常见误解是「实例化之后、初始化之前就套上代理」。实际顺序由 `AbstractAutoProxyCreator` 决定，它实现的是 `postProcessAfterInitialization`：

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

由此得到两个推论：

- `@PostConstruct` 里执行的方法走的是原始对象，此时还没有代理，所以方法内部的 self-invocation 不可能被切面拦到。
- 返回给容器的是代理对象，之后注入到别处的都是代理；但 Bean 内部的 `this` 始终指向原始对象。

### JDK 动态代理与 CGLIB

`ProxyFactory.getProxy()` 最终交给 `AopProxy` 的两个实现：

| 条件 | 实现 | 限制 |
|---|---|---|
| 目标类实现了接口 | `JdkDynamicAopProxy` | 只能按接口调用，注入时用接口类型 |
| 无接口 | `CglibAopProxy` | 不能代理 final 类和 final 方法 |

Spring Boot 2.x 起 `spring.aop.proxy-target-class` 默认为 `true`，即无脑用 CGLIB，所以「按接口注入」在 Boot 项目里通常不再必要。CGLIB 已被重打包进 `spring-core`（`org.springframework.cglib`），不需要额外引入 `cglib` 依赖——显式加反而可能撞上 JDK 版本不兼容的旧版本。

### 代理对象与自调用

`JdkDynamicAopProxy.invoke` 会取出该方法的拦截器链，空链直接反射调用，非空则走 `ReflectiveMethodInvocation.proceed()`：

```java
List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
if (chain.isEmpty()) {
    retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
} else {
    invocation = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
    retVal = invocation.proceed();
}
```

这就是自调用失效的机制来源：`this.method()` 不经过 `proxy.invoke`，链根本不会被取出来。要绕开，注入自身代理、用 `AopContext.currentProxy()`（需 `exposeProxy=true`），或把方法拆到另一个 Bean。

## 三、声明式事务

### 组装方式

`@EnableTransactionManagement` 导入 `ProxyTransactionManagementConfiguration`，它产出三样东西：

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

- `AnnotationTransactionAttributeSource` 解析方法上的 `@Transactional` 属性
- `TransactionInterceptor` 是 `MethodInterceptor`，负责在调用前后开、提交、回滚
- Advisor 把两者绑在一起，成为 `AbstractAutoProxyCreator` 的候选拦截器

拦截逻辑本身在 `TransactionAspectSupport.invokeWithinTransaction`：

```java
protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
        final InvocationCallback invocation) throws Throwable {
    TransactionAttributeSource tas = getTransactionAttributeSource();
    final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
    final PlatformTransactionManager tm = determineTransactionManager(txAttr);
    // 开启事务 → invocation.proceed() → 按返回/异常提交或回滚
}
```

### 事务不生效的条件

| 场景 | 原因 |
|---|---|
| 同类内部调用 | 不经过代理，拦截器链不执行 |
| 方法为 private 或 final | 代理无法覆盖，CGLIB 也无法重写 final |
| 异常被 try-catch 吞掉 | 拦截器看不到异常，按正常返回提交 |
| 抛出受检异常 | 默认只对 `RuntimeException` 和 `Error` 回滚 |

第四点要 `@Transactional(rollbackFor = Exception.class)` 显式声明。另外 `propagation = REQUIRES_NEW` 会真的开新连接，在已有事务里调用要留意连接池耗尽。

## 四、Spring MVC 请求链路

`DispatcherServlet.doDispatch` 的主干只有四步：

```java
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
    mappedHandler = getHandler(processedRequest);              // 1 由 HandlerMapping 定位处理器
    HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());  // 2 选适配器
    mv = ha.handle(processedRequest, response, mappedHandler.getHandler());  // 3 执行
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);  // 4 渲染
}
```

- `HandlerMapping` 负责 URL → 处理器，`RequestMappingHandlerMapping` 处理注解式 Controller
- `HandlerAdapter` 负责调用方式的差异，`RequestMappingHandlerAdapter` 里跑参数解析（`HandlerMethodArgumentResolver`）和返回值处理（`HandlerMethodReturnValueHandler`）
- `ViewResolver` 只在返回视图名时参与；`@ResponseBody` 走 `HttpMessageConverter`，不经过视图解析

第 4 步之前还会执行 `HandlerInterceptor` 的 `preHandle` / `postHandle` / `afterCompletion`，异常最终落到 `HandlerExceptionResolver`，`@ControllerAdvice` 的 `@ExceptionHandler` 就在这一环被调用。

## 相关阅读

- [Spring Boot 自动配置与启动流程](/backend/springBoot)：自动配置与启动流程如何建立在容器之上
- [JNA：Java 调用原生库的实践](/backend/jna)：需要调原生库时的 JNI/JNA 选择
- [Redis 原理与高可用方案](/backend/redis)：Spring 缓存抽象背后的数据结构
- [Netty 的事件循环、Pipeline 与零拷贝](/backend/netty)：Reactor 模型在 Netty 里的落地

