---
isTimeLine: true
title: 深入Spring源码
description: 本文通过分析Spring框架的源代码,深入剖析IoC容器、AOP、事务管理和SpringMVC的核心实现原理,为高级Java开发者提供深度技术洞察。
date: 2024-06-28
tags:
 - Spring
 - 源码分析
categories:
 - 后端开发
head:
  - - meta
    - name: keywords
      content: Spring源码,IoC容器,AOP实现,事务管理,SpringMVC原理,Java框架
---

# 深入Spring源码：IoC、AOP、事务管理与SpringMVC的核心实现

Spring框架以其强大的功能和灵活的设计在Java生态系统中占据重要地位。本文将深入Spring的源码,详细分析IoC容器、AOP、事务管理和SpringMVC的核心实现原理,为高级Java开发者提供深度技术洞察。

## 1. IoC容器：控制反转的核心实现

Spring的IoC容器是整个框架的基础,其核心实现主要在`org.springframework.beans`和`org.springframework.context`包中。

### 1.1 BeanFactory接口

`BeanFactory`是Spring IoC容器的根接口,定义了访问Spring容器的基本方法:

```java
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(String name, Class<T> requiredType) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
    // ... 其他方法
}
```

### 1.2 ApplicationContext接口

`ApplicationContext`是`BeanFactory`的子接口,提供了更多的企业级功能:

```java
public interface ApplicationContext extends EnvironmentCapable, ListableBeanFactory, HierarchicalBeanFactory,
        MessageSource, ApplicationEventPublisher, ResourcePatternResolver {
    // ... 继承自父接口的方法
}
```

### 1.3 容器启动流程

以`AnnotationConfigApplicationContext`为例,其启动流程如下:

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

### 1.4 容器启动主要扩展点

1. `BeanFactoryPostProcessor`: 允许在容器实例化任何bean之前读取bean的定义,并可以修改它。
   
   ```java
   public interface BeanFactoryPostProcessor {
       void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;
   }
   ```

2. `BeanPostProcessor`: 允许在Bean初始化前后进行额外的处理。
   
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

3. `ApplicationListener`: 用于监听应用程序中的事件。
   
   ```java
   public interface ApplicationListener<E extends ApplicationEvent> extends EventListener {
       void onApplicationEvent(E event);
   }
   ```

### 1.5 Spring内置注解的解析

Spring通过`AnnotatedBeanDefinitionReader`来解析注解。以`@Component`注解为例:

1. `ClassPathBeanDefinitionScanner`扫描类路径。
2. `ClassPathScanningCandidateComponentProvider`识别带有`@Component`及其派生注解的类。
3. `AnnotationConfigUtils`注册相关的后处理器。
4. `ConfigurationClassPostProcessor`处理`@Configuration`类。
5. `AutowiredAnnotationBeanPostProcessor`处理`@Autowired`和`@Value`注解。

关键代码片段:

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

`AutowiredAnnotationBeanPostProcessor`处理`@Autowired`注解:

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

### 1.6 Bean的生命周期

Bean的生命周期在`AbstractAutowireCapableBeanFactory`的`doCreateBean`方法中得到了充分体现:

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

在这个过程中,Spring会调用各种生命周期回调方法,如`BeanNameAware`、`BeanFactoryAware`、`InitializingBean`等接口方法,以及`@PostConstruct`和`@PreDestroy`注解标记的方法。

## 2. AOP：面向切面编程的实现

Spring AOP的核心实现位于`org.springframework.aop`包中。AOP代理的创建是在Bean实例化之后，初始化之前完成的。

### 2.1 AOP代理创建流程

Spring AOP代理的创建主要发生在`AbstractAutoProxyCreator`类中，这个类实现了`BeanPostProcessor`接口：

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

### 2.2 AOP代理创建时机

AOP代理的创建时机是在Bean的生命周期中的初始化阶段。具体来说：

1. Bean实例化
2. 属性注入
3. 初始化前（@PostConstruct）
4. AOP代理创建（在AbstractAutoProxyCreator.postProcessAfterInitialization中）
5. 初始化后

### 2.3 Spring内部代理示例：事务管理

Spring的声明式事务管理就是通过AOP实现的。以`@Transactional`注解为例：

1. `TransactionInterceptor`实现了`MethodInterceptor`接口，用于在方法调用前后处理事务。

2. `BeanFactoryTransactionAttributeSourceAdvisor`将`TransactionInterceptor`和`TransactionAttributeSource`组合在一起，形成一个Advisor。

3. `ProxyTransactionManagementConfiguration`配置类创建了这些组件：

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

当Spring容器处理带有`@Transactional`注解的Bean时：

1. `AbstractAutoProxyCreator`检测到`BeanFactoryTransactionAttributeSourceAdvisor`适用于该Bean。
2. 创建一个代理，将`TransactionInterceptor`应用到相应的方法上。
3. 当调用带有`@Transactional`注解的方法时，`TransactionInterceptor`会在方法执行前开启事务，方法执行后提交或回滚事务。

### 2.4 ProxyFactory

`ProxyFactory`是创建AOP代理的核心类：

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

Spring使用`AopProxy`接口的实现来创建代理：

```java
public interface AopProxy {
    Object getProxy();
    Object getProxy(@Nullable ClassLoader classLoader);
}
```

根据目标对象是否实现接口，Spring会选择使用JDK动态代理或CGLIB：

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

## 3. 事务管理：声明式事务的实现

Spring的事务管理主要通过AOP实现,核心类位于`org.springframework.transaction`包中。

### 3.1 TransactionInterceptor

`TransactionInterceptor`是实现声明式事务的关键:

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

`TransactionAspectSupport`包含了事务管理的核心逻辑:

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

## 4. SpringMVC：Web应用的核心实现

SpringMVC的核心实现位于`org.springframework.web.servlet`包中。

### 4.1 DispatcherServlet

`DispatcherServlet`是SpringMVC的核心,负责请求的分发:

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

`HandlerMapping`负责根据请求找到对应的处理器:

```java
public interface HandlerMapping {
    @Nullable
    HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception;
}
```

### 4.3 ViewResolver

`ViewResolver`负责解析视图名称:

```java
public interface ViewResolver {
    @Nullable
    View resolveViewName(String viewName, Locale locale) throws Exception;
}
```

## 总结

通过深入分析Spring的源码,我们可以看到框架的核心组件是如何协同工作的。IoC容器通过`BeanFactory`和`ApplicationContext`管理对象生命周期,AOP利用动态代理实现横切关注点的模块化,声明式事务借助AOP实现透明的事务管理,而SpringMVC则通过`DispatcherServlet`统一处理Web请求。
