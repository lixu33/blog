---
isTimeLine: true
title: "JNA: Calling Native Libraries from Java in Practice"
description: JNA's invocation model, type and struct mapping, memory and threading considerations, and trade-offs versus JNI and the FFM API finalized as of JDK 22. Includes API changes after JNA 5.x (loadLibrary deprecated) and common pitfalls.
date: 2024-06-03
updated: 2026-10-31
author: 烟霞不系舟
lang: zh-CN
categories:
- Backend Technology
- Backend
tags:
- Java
- JNA
- JNI
head:
- - meta
  - name: keywords
    content: JNA,Java Native Access,JNI,FFM API,Calling DLLs from Java,Structure Mapping
translatedFrom: f9f670fbe64c436e
---
# JNA: Calling Native Libraries from Java in Practice

There are three ways for Java to call C/C++ dynamic libraries: JNI, JNA, and FFM. Most triggering scenarios fall into three categories—the vendor only provides `.so`/`.dll`, the project already has an existing native library, or a certain system call is not wrapped by the JDK.

This article first compares the three approaches, then explains JNA's calling flow and a few error-prone areas.

## When should you use JNA

| Approach | Performance | Suitable for |
|---|---|---|
| JNI | Highest | Can accept maintaining C bridge code |
| **JNA** | Medium (has reflection and invocation overhead) | Don't want to touch C; quickly integrate existing libraries |
| **FFM** (`java.lang.foreign`) | High (close to JNI) | New projects on JDK 22+ |

JNI requires writing C headers and a bridge layer yourself; JNA and FFM do not.

The FFM API became final in JDK 22 (it was preview in JDK 21 and earlier), and JDK 25 has become an LTS, so **new projects on JDK 22+ should evaluate FFM first**; JNA is better suited to existing projects or scenarios that need its advanced features (automatic struct mapping, callbacks, `Pointer` arithmetic).

## 1. Loading libraries

Since JNA 5.x, `Native.loadLibrary` has been deprecated; use `Native.load` uniformly:

```java
import com.sun.jna.Library;
import com.sun.jna.Native;

public interface MyLib extends Library {
    int add(int a, int b);
}

MyLib lib = Native.load("mylib", MyLib.class);
```

The library name does not need the `lib` prefix or extension. JNA searches according to platform rules:

| Platform | File actually looked up |
|---|---|
| Linux | `libmylib.so` |
| macOS | `libmylib.dylib` |
| Windows | `mylib.dll` |

Search paths come from `jna.library.path`, `java.library.path`, and system default paths. When not found, the exception message lists all filenames attempted; just look there.

Explicitly specify the full path or options:

```java
Map<String, Object> opts = new HashMap<>();
opts.put(Library.OPTION_STRING_ENCODING, "UTF-8");   // 默认用系统编码，中文环境常踩坑
opts.put(Library.OPTION_CALLING_CONVENTION, 0);      // stdcall=0(Windows 需注意)
MyLib lib = Native.load("/opt/mylib/libmylib.so", MyLib.class, opts);
```

`OPTION_STRING_ENCODING` deserves separate mention: JNA by default converts `String` using the platform default charset. On Windows in a GBK environment, this will pass UTF-8 to the native function, manifesting as "Chinese characters turning into garbled text".

## 2. Type mapping

| Java | C |
|---|---|
| `byte` | `int8_t` / `char` |
| `short` | `int16_t` |
| `int` | `int32_t` |
| `long` | **Platform-dependent**, see below |
| `float` / `double` | `float` / `double` |
| `String` | `const char*` |
| `Pointer` | Any pointer |
| `int[]` | `int*` (arrays passed by address) |

**`long` is the biggest pitfall**: C's `long` is 8 bytes on 64-bit Linux and 4 bytes on Windows (LP64 vs LLP64). Java's `long` is always 8 bytes, so:

- The native parameter is C `long` and runs on Windows → use `int` on the Java side
- Want semantics independent of platform → use `NativeLong` in Java, or directly change the native interface to use `int64_t`

## 3. Struct mapping

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

Key points:

1. **Field order must match the C struct**. If `@FieldOrder` is omitted, reflection order is used (unreliable); since JNA 5, it must be explicitly declared
2. **`Structure` has two memory views**: the Java object and native memory. Before calling, call `write()` to synchronize Java fields to native memory; after calling, call `read()` to synchronize back. Use `Structure.ByReference` / `ByValue` to specify the passing method
3. **Java reference types cannot appear in structs** (except `String`, which is handled as `char*`); nested structs must use instances of the same type

```java
Point p = new Point();
p.x = 10;
p.y = 20;
p.write();              // 同步到原生内存
lib.fillPoint(p);       // 原生函数修改内存
p.read();               // 读回 Java 字段
```

## 4. Error handling

When a native function reports errors via `errno`, the interface method must declare `throws LastErrorException`; only then will JNA check `errno` after the return value and throw:

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

If `throws` is not declared, no exception will be thrown; it will only silently return an error value—this is an easily missed part during troubleshooting.

## 5. Performance and memory

Every JNA call incurs overhead from crossing the JNI boundary + reflective dispatch, on the order of microseconds. Optimization directions:

| Method | Description |
|---|---|
| Reduce number of calls | Pass arrays in batches instead of calling in a loop one at a time |
| Use `Memory` for direct allocation | `new Memory(size)` allocates off-heap memory; use `Pointer` to read/write and avoid `byte[]` copies |
| Avoid frequently creating `Structure` | Struct objects can be reused; after changing fields, only `write()` is needed |
| Turn off type-checking overhead | Production generally requires no additional handling; do not enable `OPTION_ALLOW_OBJECTS` when calling `Native.load` |

**Two sources of memory leaks**:

1. Memory allocated by `Memory` / `Native.malloc` is freed by GC or `dispose()`; if continuously held in a long-lived object, it will grow
2. Memory allocated by the native library itself and returned as a pointer is not freed by JNA; you must call the corresponding `free` function

## 6. Callbacks and threads

```java
public interface MyCallback extends Callback {
    void invoke(int result);
}
```

The callback object must be held by a strong reference (usually a static field or a container member); otherwise, after it is reclaimed by GC, a subsequent call from the native side will directly crash the JVM. This is the most typical cause of JNA crashes.

Threading: JNA itself does not synchronize; whether the native library is thread-safe depends entirely on the library itself. The same `Library` instance can be shared across multiple threads (method calls themselves are independent), but shared `Structure`/`Memory` instances need to be locked by yourself.

## 7. Comparison with JDK 22+ FFM

```java
// FFM 的写法（JDK 22+）
Linker linker = Linker.nativeLinker();
SymbolLookup lookup = SymbolLookup.libraryLookup("mylib", Arena.global());
MethodHandle add = linker.downcallHandle(
        lookup.find("add").orElseThrow(),
        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT, ValueLayout.JAVA_INT));
int result = (int) add.invokeExact(1, 2);
```

Differences:

- FFM is built into the JDK and requires no third-party dependency; JNA requires an additional jar
- FFM has lower call overhead, and memory lifetime is explicitly managed by `Arena`, so there is no "forgot to free"
- JNA's automatic struct mapping is more convenient; FFM requires manually calculating `MemoryLayout`, with more boilerplate code

Selection advice: For new projects on JDK 22+, use FFM; if there is already a large amount of JNA code, or you need automatic struct mapping and rich community wrappers (such as the Windows API in `jna-platform`), continue using JNA.

## 8. Troubleshooting checklist

| Symptom | Common cause |
|---|---|
| `UnsatisfiedLinkError: no xxx in java.library.path` | Incorrect library name/path, or other dependent .so files are missing (check with `ldd`) |
| JVM crashes after the call (hs_err_pid) | Callback object was GC'd, struct memory layout inconsistent with C |
| Return value clearly wrong | `long` width mismatch (Windows C long is 4 bytes) |
| Chinese garbled text | `OPTION_STRING_ENCODING` not set to UTF-8 |
| Memory keeps growing | `Memory` not released, or native-side allocated memory not freed with `free` |

## Related reading

- [Netty's event loop, Pipeline, and zero-copy](/en/backend/netty): custom protocols and zero-copy
- [Spring container, AOP, and declarative transactions implementation](/en/backend/spring): encapsulating native calls in Spring projects
- [AES and RSA: How to choose between symmetric and asymmetric encryption](/en/security/aes): encryption library invocation and mode selection

## References

- [JNA Official Documentation and API](https://java-native-access.github.io/jna/5.14.0/javadoc/)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNA Structure Usage Instructions](https://github.com/java-native-access/jna/blob/master/www/StructuresAndUnions.md)