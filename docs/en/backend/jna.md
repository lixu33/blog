---
isTimeLine: true
title: "JNA: Calling Native Libraries from Java in Practice"
description: JNA’s invocation model, type and struct mapping, memory and threading considerations, and trade-offs versus JNI and the FFM API finalized in JDK 22. Includes API changes since JNA 5.x (loadLibrary deprecated) and common pitfalls.
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
    content: JNA,Java Native Access,JNI,FFM API,Java calling DLLs,Structure mapping
translatedFrom: 587e86b7485f558d
---
## When to Use JNA

When Java needs to call a dynamic library written in C/C++, there are three paths:

| Approach | Need to write C code | Performance | Suitable for |
|---|---|---|---|
| JNI | Yes (generate header files, implement bridge) | Highest | Extreme performance, need precise control |
| **JNA** | No | Medium (reflection and call overhead) | Rapid integration with existing libraries, prototyping |
| **FFM API** (`java.lang.foreign`) | No | High (close to JNI) | Preferred for new projects on JDK 22+ |

The FFM API was finalized in JDK 22 (preview in JDK 21 and earlier), and JDK 25 has become LTS. Therefore, **new projects on JDK 22+ should evaluate FFM first**; JNA is better suited to existing projects or scenarios that need its advanced features (automatic struct mapping, callbacks, `Pointer` arithmetic).

## 1. Loading the Library

After JNA 5.x, `Native.loadLibrary` is deprecated; use `Native.load` uniformly:

```java
import com.sun.jna.Library;
import com.sun.jna.Native;

public interface MyLib extends Library {
    int add(int a, int b);
}

MyLib lib = Native.load("mylib", MyLib.class);
```

The library name does not need the `lib` prefix or file extension. JNA searches according to platform rules:

| Platform | Actual file searched |
|---|---|
| Linux | `libmylib.so` |
| macOS | `libmylib.dylib` |
| Windows | `mylib.dll` |

The search path comes from `jna.library.path`, `java.library.path`, and system default paths. If not found, the exception message lists all filenames attempted; just look there.

Explicitly specify the full path or options:

```java
Map<String, Object> opts = new HashMap<>();
opts.put(Library.OPTION_STRING_ENCODING, "UTF-8");   // 默认用系统编码，中文环境常踩坑
opts.put(Library.OPTION_CALLING_CONVENTION, 0);      // stdcall=0(Windows 需注意)
MyLib lib = Native.load("/opt/mylib/libmylib.so", MyLib.class, opts);
```

`OPTION_STRING_ENCODING` deserves a separate mention: JNA converts `String` using the platform default charset by default. On Windows with a GBK environment, it will pass UTF-8 to native functions, resulting in "Chinese text becoming garbled."

## 2. Type Mapping

| Java | C |
|---|---|
| `byte` | `int8_t` / `char` |
| `short` | `int16_t` |
| `int` | `int32_t` |
| `long` | **platform-dependent**, see below |
| `float` / `double` | `float` / `double` |
| `String` | `const char*` |
| `Pointer` | any pointer |
| `int[]` | `int*` (array passed by address) |

**`long` is the biggest trap**: C `long` is 8 bytes on 64-bit Linux and 4 bytes on Windows (LP64 vs LLP64). Java `long` is always 8 bytes, so:

- If the native parameter is C `long` and runs on Windows → use `int` on the Java side
- If you want platform-independent semantics → use `NativeLong` on the Java side, or change the native interface to use `int64_t` directly

## 3. Struct Mapping

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

1. **Field order must match the C struct**. If `@FieldOrder` is omitted, reflection order is used (unreliable); since JNA 5, explicit declaration is required
2. **`Structure` has two memory views**: the Java object and native memory. Before a call, use `write()` to synchronize Java fields to native memory; after the call, use `read()` to synchronize back. Use `Structure.ByReference` / `ByValue` to make the passing mode explicit
3. **Structs cannot contain Java reference types** (except `String`, which is handled as `char*`); nested structs must use instances of the same class

```java
Point p = new Point();
p.x = 10;
p.y = 20;
p.write();              // 同步到原生内存
lib.fillPoint(p);       // 原生函数修改内存
p.read();               // 读回 Java 字段
```

## 4. Error Handling

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

If `throws` is not declared, no exception is thrown; it only silently returns the error value—this is an easy step to miss during troubleshooting.

## 5. Performance and Memory

Every JNA call incurs overhead from crossing the JNI boundary plus reflection dispatch, on the order of microseconds. Optimization directions:

| Approach | Description |
|---|---|
| Reduce number of calls | Pass arrays in batches instead of calling once per iteration |
| Allocate directly with `Memory` | `new Memory(size)` allocates off-heap memory; use `Pointer` to read/write and avoid `byte[]` copying |
| Avoid creating `Structure` frequently | Struct objects can be reused; after changing fields, just call `write()` |
| Disable type-checking overhead | Generally no extra handling is needed in production; do not enable `OPTION_ALLOW_OBJECTS` in `Native.load` |

**Two sources of memory leaks**:

1. Memory allocated by `Memory` / `Native.malloc` is released by GC or `dispose()`; if it is held continuously in a long-lived object, it will grow
2. For memory allocated by the native library itself and returned as a pointer, JNA is not responsible for freeing it; you must call the corresponding `free` function

## 6. Callbacks and Threads

```java
public interface MyCallback extends Callback {
    void invoke(int result);
}
```

The callback object must be held by a strong reference (usually a static field or container member); otherwise, after it is GC'd, a subsequent native call will crash the JVM directly. This is the most typical cause of JNA crashes.

Regarding threads: JNA itself does not synchronize; whether the native library is thread-safe depends entirely on the library itself. The same `Library` instance can be shared across threads (method calls themselves are independent), but shared `Structure`/`Memory` instances must be locked manually.

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
- FFM has lower call overhead, and memory lifetime is explicitly managed by `Arena`, so there is no "forgot to free" situation
- JNA's automatic struct mapping is more convenient; FFM requires manual calculation of `MemoryLayout`, resulting in more boilerplate code

Selection advice: for new projects on JDK 22+, use FFM; if you already have a large amount of JNA code, or need automatic struct mapping and rich community wrappers (such as the Windows API in `jna-platform`), continue using JNA.

## 8. Troubleshooting Checklist

| Symptom | Common Cause |
|---|---|
| `UnsatisfiedLinkError: no xxx in java.library.path` | Incorrect library name/path, or another dependent .so is missing (check with `ldd`) |
| JVM crash after call (hs_err_pid) | Callback object was GC'd, or struct memory layout does not match C |
| Return value is clearly wrong | `long` width mismatch (Windows C long is 4 bytes) |
| Chinese garbled text | `OPTION_STRING_ENCODING` is not set to UTF-8 |
| Memory keeps growing | `Memory` is not released, or memory allocated on the native side is not freed with `free` |

## References

- [JNA official documentation and API](https://java-native-access.github.io/jna/5.14.0/javadoc/)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNA Structure usage instructions](https://github.com/java-native-access/jna/blob/master/www/StructuresAndUnions.md)