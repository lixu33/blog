---
isTimeLine: true
title: JNA：Java 调用原生库的实践
description: JNA 的调用模型、类型与结构体映射、内存与线程注意事项，以及与 JNI、JDK 22 起正式化的 FFM API 的取舍。包含 JNA 5.x 后的 API 变更（loadLibrary 已废弃）和常见踩坑。
date: 2024-06-03
updated: 2026-10-31
author: 烟霞不系舟
lang: zh-CN
categories:
- 后端技术
- Backend
tags:
- Java
- JNA
- JNI
head:
- - meta
  - name: keywords
    content: JNA, Java Native Access, JNI, FFM API, Java 调用 dll, Structure 映射
---

# JNA：Java 调用原生库的实践

Java 调用 C/C++ 动态库有三种方式：JNI、JNA、FFM。触发场景大多是这三类——厂商只提供 `.so`/`.dll`，项目里已有现成的 native 库，或者某个系统调用 JDK 没有封装。

这篇先对比三种方式，再讲 JNA 的调用流程和几个容易出错的地方。

## 什么时候该用 JNA

| 方案 | 性能 | 适合 |
|---|---|---|
| JNI | 最高 | 能接受维护 C 桥接代码 |
| **JNA** | 中（有反射与调用开销） | 不想碰 C，快速集成现有库 |
| **FFM**（`java.lang.foreign`） | 高（接近 JNI） | JDK 22+ 新项目 |

JNI 需要自己写 C 头文件与桥接层，JNA 和 FFM 都不用。

FFM API 在 JDK 22 正式转正（JDK 21 及以前是 preview），JDK 25 已成为 LTS，所以**新项目在 JDK 22+ 上应优先评估 FFM**，JNA 更适合存量项目或需要它的高级特性（自动结构体映射、回调、`Pointer` 算术）的场景。

## 一、加载库

JNA 5.x 之后 `Native.loadLibrary` 已废弃，统一用 `Native.load`：

```java
import com.sun.jna.Library;
import com.sun.jna.Native;

public interface MyLib extends Library {
    int add(int a, int b);
}

MyLib lib = Native.load("mylib", MyLib.class);
```

库名不需要写 `lib` 前缀和扩展名。JNA 按平台规则搜索：

| 平台 | 实际查找的文件 |
|---|---|
| Linux | `libmylib.so` |
| macOS | `libmylib.dylib` |
| Windows | `mylib.dll` |

搜索路径来自 `jna.library.path`、`java.library.path` 和系统默认路径。找不到时异常信息里会列出尝试过的所有文件名，直接看即可。

显式指定完整路径或选项：

```java
Map<String, Object> opts = new HashMap<>();
opts.put(Library.OPTION_STRING_ENCODING, "UTF-8");   // 默认用系统编码，中文环境常踩坑
opts.put(Library.OPTION_CALLING_CONVENTION, 0);      // stdcall=0(Windows 需注意)
MyLib lib = Native.load("/opt/mylib/libmylib.so", MyLib.class, opts);
```

`OPTION_STRING_ENCODING` 值得单独提：JNA 默认用平台默认字符集转换 `String`，在 GBK 环境的 Windows 上会把 UTF-8 传给原生函数，表现为「中文变乱码」。

## 二、类型映射

| Java | C |
|---|---|
| `byte` | `int8_t` / `char` |
| `short` | `int16_t` |
| `int` | `int32_t` |
| `long` | **平台相关**，见下 |
| `float` / `double` | `float` / `double` |
| `String` | `const char*` |
| `Pointer` | 任意指针 |
| `int[]` | `int*`（数组按地址传入） |

**`long` 是最大的坑**：C 的 `long` 在 Linux 64 位是 8 字节，在 Windows 上是 4 字节（LP64 vs LLP64）。Java 的 `long` 恒为 8 字节，所以：

- 原生参数是 C `long` 且跑在 Windows 上 → Java 侧用 `int`
- 想让语义与平台无关 → Java 用 `NativeLong`，或直接改原生接口用 `int64_t`

## 三、结构体映射

```java
import com.sun.jna.Structure;

@Structure.FieldOrder({"x", "y"})
public class Point extends Structure {
    public int x;
    public int y;

    public Point() { super(); }
    public Point(Pointer p) { super(p); read(); }   // 从原生内存反序列化
}
```

要点：

1. **字段顺序必须与 C 结构体一致**，`@FieldOrder` 不写会按反射顺序（不可靠），JNA 5 之后要求显式声明
2. **`Structure` 有两块内存视图**：Java 对象和原生内存。调用前要 `write()` 把 Java 字段同步到原生内存，调用后要 `read()` 反向同步。用 `Structure.ByReference` / `ByValue` 明确传递方式
3. **结构体里不能有 Java 引用类型**（`String` 除外，会按 `char*` 处理），嵌套结构体要用同类实例

```java
Point p = new Point();
p.x = 10;
p.y = 20;
p.write();              // 同步到原生内存
lib.fillPoint(p);       // 原生函数修改内存
p.read();               // 读回 Java 字段
```

## 四、错误处理

原生函数用 `errno` 报错时，接口方法要声明 `throws LastErrorException`，JNA 才会在返回值后检查 `errno` 并抛出：

```java
public interface MyLib extends Library {
    int openDevice(int id) throws LastErrorException;
}

try {
    lib.openDevice(1);
} catch (LastErrorException e) {
    int code = e.getErrorCode();    // 等价于 Native.getLastError()
    // errno 含义按平台查 man 手册
}
```

不声明 `throws` 的话不会抛异常，只会静默返回错误值——这是排错时容易漏掉的一环。

## 五、性能与内存

JNA 的每次调用都有跨 JNI 边界 + 反射分发的开销，量级在微秒级。优化方向：

| 手段 | 说明 |
|---|---|
| 减少调用次数 | 批量传数组而非循环单次调用 |
| 用 `Memory` 直接分配 | `new Memory(size)` 分配堆外内存，配合 `Pointer` 读写，避免 `byte[]` 复制 |
| 避免频繁创建 `Structure` | 结构体对象可复用，改完字段只需 `write()` |
| 关闭类型检查开销 | 生产环境一般不需额外处理，`Native.load` 时不要开 `OPTION_ALLOW_OBJECTS` |

**内存泄漏的两个来源**：

1. `Memory` / `Native.malloc` 分配的内存由 GC 或 `dispose()` 释放，长生命周期对象里一直持有就会涨
2. 原生库自己分配、返回指针的内存，JNA 不负责释放，必须调对应的 `free` 函数

## 六、回调与线程

```java
public interface MyCallback extends Callback {
    void invoke(int result);
}
```

回调对象必须被强引用持有（通常是静态字段或容器成员），否则被 GC 回收后原生侧再次调用会直接崩 JVM。这是 JNA 最典型的崩溃原因。

线程方面：JNA 本身不做同步，原生库是否线程安全完全取决于库本身。同一 `Library` 实例可在多线程共用（方法调用本身是独立的），但共享的 `Structure`/`Memory` 实例需要自己加锁。

## 七、与 JDK 22+ FFM 的对比

```java
// FFM 的写法（JDK 22+）
Linker linker = Linker.nativeLinker();
SymbolLookup lookup = SymbolLookup.libraryLookup("mylib", Arena.global());
MethodHandle add = linker.downcallHandle(
        lookup.find("add").orElseThrow(),
        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT, ValueLayout.JAVA_INT));
int result = (int) add.invokeExact(1, 2);
```

差异：

- FFM 是 JDK 内置，无需第三方依赖；JNA 需要额外 jar
- FFM 调用开销更低，且内存生命周期由 `Arena` 明确管理，不会出现「忘了 free」
- JNA 的结构体自动映射更省事；FFM 需要手动计算 `MemoryLayout`，样板代码更多

选型建议：新项目 JDK 22+ 用 FFM；已有大量 JNA 代码、或需要自动结构体映射与丰富社区封装的（如 `jna-platform` 里的 Windows API），继续用 JNA。

## 八、排查清单

| 现象 | 常见原因 |
|---|---|
| `UnsatisfiedLinkError: no xxx in java.library.path` | 库名/路径不对，或依赖的其他 .so 缺失（用 `ldd` 查） |
| 调用后 JVM 崩溃（hs_err_pid） | 回调对象被 GC、结构体内存布局与 C 不一致 |
| 返回值明显不对 | `long` 宽度不匹配（Windows C long 是 4 字节） |
| 中文乱码 | `OPTION_STRING_ENCODING` 未设 UTF-8 |
| 内存持续增长 | `Memory` 未释放，或原生侧分配的内存没调 `free` |

## 相关阅读

- [Netty 的事件循环、Pipeline 与零拷贝](/backend/netty)：自定义协议与零拷贝
- [Spring 容器、AOP 与声明式事务的实现](/backend/spring)：在 Spring 项目里封装 native 调用
- [AES 与 RSA：对称与非对称加密怎么选](/security/aes)：加密库的调用与模式选择

## 参考

- [JNA 官方文档与 API](https://java-native-access.github.io/jna/5.14.0/javadoc/)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNA Structure 使用说明](https://github.com/java-native-access/jna/blob/master/www/StructuresAndUnions.md)
