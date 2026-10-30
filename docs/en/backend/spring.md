---
isTimeLine: true
title: Deep Dive into Spring Source Code
description: By analyzing the Spring Framework source code, this article provides an in-depth examination of the core implementation principles of the IoC container, AOP, transaction management, and Spring MVC, offering deep technical insights for senior Java developers.
date: 2024-06-28
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
    content: Spring Source Code,IoC container,AOP implementation,Transaction Management,SpringMVC Principles,Java Framework
translatedFrom: a119d9593d0c0aaf
---
# Deep Dive into Spring Source Code: Core Implementations of IoC, AOP, Transaction Management, and SpringMVC

The Spring framework occupies an important position in the Java ecosystem due to its powerful features and flexible design. This article takes an in-depth look at Spring's source code, analyzing in detail the core implementation principles of the IoC container, AOP, transaction management, and SpringMVC, providing advanced Java developers with deep technical insight.

## 1. IoC Container: The Core Implementation of Inversion of Control

Spring's IoC container is the foundation of the entire framework, and its core implementation is mainly located in the `org.springframework.beans` and `org.springframework.context` packages.

### 1.1 BeanFactory Interface

`BeanFactory` is the root interface of the Spring IoC container and defines the basic methods for accessing the Spring container:

```java
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(String name, Class<T> requiredType) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
    // ... 其他方法
}
```

### 1.2 ApplicationContext Interface

`ApplicationContext` is a sub-interface of `BeanFactory` and provides more enterprise-level features:

```java
public interface ApplicationContext extends EnvironmentCapable, ListableBeanFactory, HierarchicalBeanFactory,
        MessageSource, ApplicationEventPublisher, ResourcePatternResolver {
    // ... 继承自父接口的方法
}
```

### 1.3 Container Startup Process

Taking `AnnotationConfigApplicationContext` as an example, its startup process is as follows:

```java
public class AnnotationConfigApplicationContext extends GenericApplicationContext implements AnnotationConfigRegistry {
    public AnnotationConfigApplicationContext() {
        this.reader = new AnnotatedBeanDefinitionReader(this);
        this.scanner = new ClassPathBeanDefinitionScanner(this);
    }

    public AnnotationConfigApplicationContext(Class<?>... componentClasses) {
        this();
        register(componentClasses);
        refresh();
    }

    @Override
    public void refresh() throws BeansException, IllegalStateException {
        synchronized (this.startupShutdownMonitor) {
            // 1. 准备刷新上下文环境
            prepareRefresh();

            // 2. 初始化BeanFactory,并进行XML文件读取
            ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

            // 3. 对BeanFactory进行各种功能填充
            prepareBeanFactory(beanFactory);

            try {
                // 4. 子类覆盖方法做额外的处理
                postProcessBeanFactory(beanFactory);

                // 5. 激活各种BeanFactory处理器
                invokeBeanFactoryPostProcessors(beanFactory);

                // 6. 注册拦截Bean创建的Bean处理器
                registerBeanPostProcessors(beanFactory);

                // 7. 初始化消息源
                initMessageSource();

                // 8. 初始化应用事件广播器
                initApplicationEventMulticaster();

                // 9. 子类重写方法,在容器刷新中可以自定义逻辑
                onRefresh();

                // 10. 注册监听器
                registerListeners();

                // 11. 初始化所有剩下的单例Bean
                finishBeanFactoryInitialization(beanFactory);

                // 12. 完成刷新过程,通知生命周期处理器lifecycleProcessor刷新过程,同时发出ContextRefreshEvent通知
                finishRefresh();
            }
            catch (BeansException ex) {
                // 销毁已经创建的单例Bean
                destroyBeans();

                // 重置'active'标志
                cancelRefresh(ex);

                throw ex;
            }
        }
    }
}
```

### 1.4 Main Extension Points During Container Startup

1. `BeanFactoryPostProcessor`: Allows reading and modifying bean definitions before the container instantiates any beans.
   

   ```java
   public interface BeanFactoryPostProcessor {
       void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;
   }
   ```

2. `BeanPostProcessor`: Allows additional processing before and after bean initialization.
   

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

3. `ApplicationListener`: Used to listen for events in the application.
   

   ```java
   public interface ApplicationListener<E extends ApplicationEvent> extends EventListener {
       void onApplicationEvent(E event);
   }
   ```

### 1.5 Parsing of Spring's Built-in Annotations

Spring parses annotations through `AnnotatedBeanDefinitionReader`. Taking the `@Component` annotation as an example:

1. `ClassPathBeanDefinitionScanner` scans the classpath.
2. `ClassPathScanningCandidateComponentProvider` identifies classes annotated with `@Component` and its derived annotations.
3. `AnnotationConfigUtils` registers the relevant post-processors.
4. `ConfigurationClassPostProcessor` processes `@Configuration` classes.
5. `AutowiredAnnotationBeanPostProcessor` processes `@Autowired` and `@Value` annotations.

Key code snippets:

```java
public class ClassPathBeanDefinitionScanner extends ClassPathScanningCandidateComponentProvider {
    protected Set<BeanDefinitionHolder> doScan(String... basePackages) {
        Set<BeanDefinitionHolder> beanDefinitions = new LinkedHashSet<>();
        for (String basePackage : basePackages) {
            Set<BeanDefinition> candidates = findCandidateComponents(basePackage);
            for (BeanDefinition candidate : candidates) {
                // ... 解析作用域等信息
                BeanDefinitionHolder definitionHolder = new BeanDefinitionHolder(candidate, beanName);
                beanDefinitions.add(definitionHolder);
                registerBeanDefinition(definitionHolder, this.registry);
            }
        }
        return beanDefinitions;
    }
}
```

`AutowiredAnnotationBeanPostProcessor` processes the `@Autowired` annotation:

```java
public class AutowiredAnnotationBeanPostProcessor extends InstantiationAwareBeanPostProcessorAdapter
        implements MergedBeanDefinitionPostProcessor, PriorityOrdered, BeanFactoryAware {

    @Override
    public PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName) {
        InjectionMetadata metadata = findAutowiringMetadata(beanName, bean.getClass(), pvs);
        try {
            metadata.inject(bean, beanName, pvs);
        }
        catch (BeanCreationException ex) {
            throw ex;
        }
        catch (Throwable ex) {
            throw new BeanCreationException(beanName, "Injection of autowired dependencies failed", ex);
        }
        return pvs;
    }
}
```

### 1.6 Bean Lifecycle

The bean lifecycle is fully reflected in the `doCreateBean` method of `AbstractAutowireCapableBeanFactory`:

```java
protected Object doCreateBean(String beanName, RootBeanDefinition mbd, @Nullable Object[] args) throws BeanCreationException {
    // 1. 实例化Bean
    BeanWrapper instanceWrapper = createBeanInstance(beanName, mbd, args);
    final Object bean = instanceWrapper.getWrappedInstance();

    // 2. 属性填充
    populateBean(beanName, mbd, instanceWrapper);

    // 3. 初始化Bean
    Object exposedObject = initializeBean(beanName, exposedObject, mbd);
    
    // ... 其他逻辑
    
    return exposedObject;
}
```

During this process, Spring invokes various lifecycle callback methods, such as interface methods from `BeanNameAware`, `BeanFactoryAware`, `InitializingBean`, etc., as well as methods marked with the `@PostConstruct` and `@PreDestroy` annotations.

## 2. AOP: Implementation of Aspect-Oriented Programming

The core implementation of Spring AOP is located in the `org.springframework.aop` package. The creation of AOP proxies is completed after bean instantiation and before initialization.

### 2.1 AOP Proxy Creation Process

The creation of Spring AOP proxies mainly occurs in the `AbstractAutoProxyCreator` class, which implements the `BeanPostProcessor` interface:

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
        // ... 前置检查

        // 获取适用于bean的通知器
        Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
        if (specificInterceptors != DO_NOT_PROXY) {
            this.advisedBeans.put(cacheKey, Boolean.TRUE);
            // 创建代理
            Object proxy = createProxy(
                    bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
            this.proxyTypes.put(cacheKey, proxy.getClass());
            return proxy;
        }

        this.advisedBeans.put(cacheKey, Boolean.FALSE);
        return bean;
    }

    protected Object createProxy(Class<?> beanClass, @Nullable String beanName,
            @Nullable Object[] specificInterceptors, TargetSource targetSource) {

        ProxyFactory proxyFactory = new ProxyFactory();
        // ... 设置ProxyFactory的属性

        Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
        proxyFactory.addAdvisors(advisors);
        proxyFactory.setTargetSource(targetSource);
        customizeProxyFactory(proxyFactory);

        return proxyFactory.getProxy(getProxyClassLoader());
    }
}
```

### 2.2 Timing of AOP Proxy Creation

AOP proxies are created during the initialization phase of the bean lifecycle. Specifically:

1. Bean instantiation
2. Property injection
3. Before initialization (@PostConstruct)
4. AOP proxy creation (in AbstractAutoProxyCreator.postProcessAfterInitialization)
5. After initialization

### 2.3 Example of Spring Internal Proxy: Transaction Management

Spring's declarative transaction management is implemented through AOP. Taking the `@Transactional` annotation as an example:

1. `TransactionInterceptor` implements the `MethodInterceptor` interface and is used to handle transactions before and after method calls.

2. `BeanFactoryTransactionAttributeSourceAdvisor` combines `TransactionInterceptor` and `TransactionAttributeSource` to form an Advisor.

3. The `ProxyTransactionManagementConfiguration` configuration class creates these components:

```java
@Configuration
public class ProxyTransactionManagementConfiguration extends AbstractTransactionManagementConfiguration {

    @Bean(name = TransactionManagementConfigUtils.TRANSACTION_ADVISOR_BEAN_NAME)
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public BeanFactoryTransactionAttributeSourceAdvisor transactionAdvisor() {
        BeanFactoryTransactionAttributeSourceAdvisor advisor = new BeanFactoryTransactionAttributeSourceAdvisor();
        advisor.setTransactionAttributeSource(transactionAttributeSource());
        advisor.setAdvice(transactionInterceptor());
        advisor.setOrder(this.enableTx.<Integer>getNumber("order"));
        return advisor;
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public TransactionAttributeSource transactionAttributeSource() {
        return new AnnotationTransactionAttributeSource();
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public TransactionInterceptor transactionInterceptor() {
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionAttributeSource(transactionAttributeSource());
        if (this.txManager != null) {
            interceptor.setTransactionManager(this.txManager);
        }
        return interceptor;
    }
}
```

When the Spring container processes a bean annotated with `@Transactional`:

1. `AbstractAutoProxyCreator` detects that `BeanFactoryTransactionAttributeSourceAdvisor` applies to the bean.
2. It creates a proxy and applies `TransactionInterceptor` to the corresponding methods.
3. When a method annotated with `@Transactional` is called, `TransactionInterceptor` starts a transaction before method execution and commits or rolls back the transaction after method execution.

### 2.4 ProxyFactory

`ProxyFactory` is the core class for creating AOP proxies:

```java
public class ProxyFactory extends ProxyCreatorSupport {
    public ProxyFactory() {
    }

    public ProxyFactory(Object target) {
        setTarget(target);
        setInterfaces(ClassUtils.getAllInterfaces(target));
    }

    public Object getProxy() {
        return createAopProxy().getProxy();
    }

    // ... 其他方法
}
```

### 2.5 AopProxy

Spring uses implementations of the `AopProxy` interface to create proxies:

```java
public interface AopProxy {
    Object getProxy();
    Object getProxy(@Nullable ClassLoader classLoader);
}
```

Depending on whether the target object implements interfaces, Spring chooses to use JDK dynamic proxies or CGLIB:

#### JdkDynamicAopProxy

```java
final class JdkDynamicAopProxy implements AopProxy, InvocationHandler {
    // ... 其他代码

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        MethodInvocation invocation;
        Object oldProxy = null;
        boolean setProxyContext = false;

        TargetSource targetSource = this.advised.targetSource;
        Object target = null;

        try {
            // ... 省略了一些检查和特殊处理

            Object retVal;

            if (this.advised.exposeProxy) {
                oldProxy = AopContext.setCurrentProxy(proxy);
                setProxyContext = true;
            }

            target = targetSource.getTarget();
            Class<?> targetClass = (target != null ? target.getClass() : null);

            List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);

            if (chain.isEmpty()) {
                Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
                retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
            }
            else {
                invocation = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
                retVal = invocation.proceed();
            }

            Class<?> returnType = method.getReturnType();
            if (retVal != null && retVal == target &&
                    returnType != Object.class && returnType.isInstance(proxy) &&
                    !RawTargetAccess.class.isAssignableFrom(method.getDeclaringClass())) {
                retVal = proxy;
            }
            return retVal;
        }
        finally {
            if (target != null && !targetSource.isStatic()) {
                targetSource.releaseTarget(target);
            }
            if (setProxyContext) {
                AopContext.setCurrentProxy(oldProxy);
            }
        }
    }
}
```

#### CglibAopProxy

```java
class CglibAopProxy implements AopProxy, Serializable {
    // ... 其他代码

    @Override
    public Object getProxy(@Nullable ClassLoader classLoader) {
        // ... 省略了一些准备工作

        Enhancer enhancer = createEnhancer();
        if (classLoader != null) {
            enhancer.setClassLoader(classLoader);
            if (classLoader instanceof SmartClassLoader &&
                    ((SmartClassLoader) classLoader).isClassReloadable(proxySuperClass)) {
                enhancer.setUseCache(false);
            }
        }
        enhancer.setSuperclass(proxySuperClass);
        enhancer.setInterfaces(AopProxyUtils.completeProxiedInterfaces(this.advised));
        enhancer.setNamingPolicy(SpringNamingPolicy.INSTANCE);
        enhancer.setStrategy(new ClassLoaderAwareGeneratorStrategy(classLoader));

        Callback[] callbacks = getCallbacks(rootClass);
        Class<?>[] types = new Class<?>[callbacks.length];
        for (int x = 0; x < types.length; x++) {
            types[x] = callbacks[x].getClass();
        }
        enhancer.setCallbackFilter(new ProxyCallbackFilter(
                this.advised.getConfigurationOnlyCopy(), this.fixedInterceptorMap, this.fixedInterceptorOffset));
        enhancer.setCallbackTypes(types);

        return createProxyClassAndInstance(enhancer, callbacks);
    }

    // ... 其他方法
}
```

## 3. Transaction Management: Implementation of Declarative Transactions

Spring's transaction management is mainly implemented through AOP, and the core classes are located in the `org.springframework.transaction` package.

### 3.1 TransactionInterceptor

`TransactionInterceptor` is the key to implementing declarative transactions:

```java
public class TransactionInterceptor extends TransactionAspectSupport implements MethodInterceptor, Serializable {
    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);
        return invokeWithinTransaction(invocation.getMethod(), targetClass, invocation::proceed);
    }
}
```

### 3.2 TransactionAspectSupport

`TransactionAspectSupport` contains the core logic of transaction management:

```java
public abstract class TransactionAspectSupport implements BeanFactoryAware, InitializingBean {
    protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
            final InvocationCallback invocation) throws Throwable {
        
        TransactionAttributeSource tas = getTransactionAttributeSource();
        final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
        final PlatformTransactionManager tm = determineTransactionManager(txAttr);

        // ... 事务执行逻辑
    }
    
    // ... 其他方法
}
```

## 4. SpringMVC: The Core Implementation of Web Applications

The core implementation of SpringMVC is located in the `org.springframework.web.servlet` package.

### 4.1 DispatcherServlet

`DispatcherServlet` is the core of SpringMVC and is responsible for dispatching requests:

```java
public class DispatcherServlet extends FrameworkServlet {
    @Override
    protected void doService(HttpServletRequest request, HttpServletResponse response) throws Exception {
        // ... 请求预处理
        try {
            doDispatch(request, response);
        }
        finally {
            // ... 请求后处理
        }
    }

    protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
        HttpServletRequest processedRequest = request;
        HandlerExecutionChain mappedHandler = null;
        
        // 1. 确定处理器
        mappedHandler = getHandler(processedRequest);
        
        // 2. 确定处理器适配器
        HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());
        
        // 3. 执行处理器
        mv = ha.handle(processedRequest, response, mappedHandler.getHandler());
        
        // 4. 视图解析
        processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
    }
    
    // ... 其他方法
}
```

### 4.2 HandlerMapping

`HandlerMapping` is responsible for finding the corresponding handler based on the request:

```java
public interface HandlerMapping {
    @Nullable
    HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception;
}
```

### 4.3 ViewResolver

`ViewResolver` is responsible for resolving view names:

```java
public interface ViewResolver {
    @Nullable
    View resolveViewName(String viewName, Locale locale) throws Exception;
}
```

## Conclusion

Through an in-depth analysis of Spring's source code, we can see how the framework's core components work together. The IoC container manages object lifecycles through `BeanFactory` and `ApplicationContext`, AOP uses dynamic proxies to modularize cross-cutting concerns, declarative transactions leverage AOP to achieve transparent transaction management, and SpringMVC uniformly handles web requests through `DispatcherServlet`.