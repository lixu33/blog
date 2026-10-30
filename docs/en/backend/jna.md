---
isTimeLine: true
title: "JNA: Calling Native Libraries from Java in Practice"
description: JNA's invocation model, type and struct mapping, memory and threading considerations, and trade-offs versus JNI and the FFM API finalized in JDK 22. Includes API changes after JNA 5.x (loadLibrary deprecated) and common pitfalls.
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
translatedFrom: a33a48d5c73a7694
---
There are three ways for Java to call C/C++ dynamic libraries: JNI, JNA, and FFM. The triggering scenarios are mostly these three: the vendor only provides `.so`/`.dll`, the project already has an existing native library, or some system call is not wrapped by the JDK.

This article first compares the three approaches, then explains JNA's invocation flow and a few error-prone points.

## When to Use JNA

| Approach | Performance | Suitable for |
|---|---|---|
| JNI | Highest | Can accept maintaining C bridge code |
| **JNA** | Medium (reflection and invocation overhead) | Don't want to touch C, quickly integrate existing libraries |
| **FFM** (`java.lang.foreign`) | High (close to JNI) | New projects on JDK 22+ |

JNI requires writing your own C header and bridge layer, while JNA and FFM do not.

The FFM API became official in JDK 22 (preview in JDK 21 and earlier), and JDK 25 has become LTS, so **new projects on JDK 22+ should evaluate FFM first**; JNA is more suitable for existing projects or scenarios requiring its advanced features (automatic struct mapping, callbacks, `Pointer` arithmetic).

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

The library name does not need the `lib` prefix or extension. JNA searches according to platform rules:

| Platform | Actual file searched for |
|---|---|
| Linux | `libmylib.so` |
| macOS | `libmylib.dylib` |
| Windows | `mylib.dll` |

The search path comes from `jna.library.path`, `java.library.path`, and system default paths. When it cannot be found, the exception message lists all attempted file names; just look there.

Explicitly specify the full path or options:

```java
Map<String, Object> opts = new HashMap<>();
opts.put(Library.OPTION_STRING_ENCODING, "UTF-8");   // 默认用系统编码，中文环境常踩坑
opts.put(Library.OPTION_CALLING_CONVENTION, 0);      // stdcall=0(Windows 需注意)
MyLib lib = Native.load("/opt/mylib/libmylib.so", MyLib.class, opts);
```

`OPTION_STRING_ENCODING` deserves separate mention: JNA by default uses the platform default charset to convert `String`; on Windows in a GBK environment, it will pass UTF-8 to native functions, manifesting as "Chinese characters turned into garbled text".

## 2. Type Mapping

| Java | C |
|---|---|
| `byte` | `int8_t` / `char` |
| `short` | `int16_t` |
| `int` | `int32_t` |
| `long` | **platform-dependent**, see below |
| `float` / `double` | `float` / `double` |
| `String` | `const char*` |
| `Pointer` | arbitrary pointer |
| `int[]` | `int*` (arrays passed by address) |

**`long` is the biggest pitfall**: C's `long` is 8 bytes on 64-bit Linux and 4 bytes on Windows (LP64 vs LLP64). Java's `long` is always 8 bytes, so:

- If the native parameter is C `long` and runs on Windows → use `int` on the Java side
- To make semantics platform-independent → use `NativeLong` in Java, or directly change the native interface to use `int64_t`

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

1. **Field order must match the C struct**; if `@FieldOrder` is omitted, it will follow reflection order (unreliable); after JNA 5 it must be explicitly declared
2. **`Structure` has two memory views**: the Java object and native memory. Before invocation, call `write()` to synchronize Java fields to native memory; after invocation, call `read()` to synchronize back. Use `Structure.ByReference` / `ByValue` to specify the passing mode
3. **Structs cannot contain Java reference types** (except `String`, which is handled as `char*`); nested structs must use instances of the same type

```java
Point p = new Point();
p.x = 10;
p.y = 20;
p.write();              // 同步到原生内存
lib.fillPoint(p);       // 原生函数修改内存
p.read();               // 读回 Java 字段
```

## 4. Error Handling

When native functions report errors via `errno`, the interface method must declare `throws LastErrorException`; only then will JNA check `errno` after the return value and throw:

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

## 5. Performance and Memory

Every JNA call has the overhead of crossing the JNI boundary + reflective dispatch, on the order of microseconds. Optimization directions:

| Method | Description |
|---|---|
| Reduce number of calls | Pass arrays in batches instead of calling once per loop |
| Allocate directly with `Memory` | `new Memory(size)` allocates off-heap memory; use it with `Pointer` for reads/writes to avoid copying `byte[]` |
| Avoid frequently creating `Structure` | Struct objects can be reused; after changing fields, only `write()` is needed |
| Disable type-checking overhead | Production environments generally need no extra handling; do not enable `OPTION_ALLOW_OBJECTS` when calling `Native.load` |

**Two sources of memory leaks**:

1. Memory allocated by `Memory` / `Native.malloc` is released by GC or `dispose()`; if it is held continuously in long-lived objects, it will grow
2. Memory allocated by the native library itself and returned as a pointer is not JNA's responsibility to free; you must call the corresponding `free` function

## 6. Callbacks and Threads

```java
public interface MyCallback extends Callback {
    void invoke(int result);
}
```

The callback object must be held by a strong reference (usually a static field or a container member); otherwise, after it is reclaimed by GC, a subsequent call from the native side will directly crash the JVM. This is the most typical cause of JNA crashes.

Regarding threads: JNA itself does not perform synchronization; whether the native library is thread-safe depends entirely on the library itself. The same `Library` instance can be shared across multiple threads (method invocations themselves are independent), but shared `Structure`/`Memory` instances need to be locked by yourself.

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

- FFM is built into the JDK and requires no third-party dependency; JNA requires an extra jar
- FFM has lower invocation overhead, and memory lifetime is explicitly managed by `Arena`, so "forgot to free" does not occur
- JNA's automatic struct mapping is more convenient; FFM requires manually calculating `MemoryLayout`, with more boilerplate code

Selection advice: for new projects on JDK 22+, use FFM; for projects with a large amount of existing JNA code, or that need automatic struct mapping and rich community wrappers (such as the Windows API in `jna-platform`), continue using JNA.

## 8. Troubleshooting Checklist

| Symptom | Common cause |
|---|---|
| `UnsatisfiedLinkError: no xxx in java.library.path` | Library name/path is wrong, or another depended-on .so is missing (check with `ldd`) |
| JVM crashes after invocation (hs_err_pid) | Callback object was GC'd; struct memory layout is inconsistent with C |
| Return value is obviously wrong | `long` width mismatch (Windows C long is 4 bytes) |
| Chinese garbled text | `OPTION_STRING_ENCODING` not set to UTF-8 |
| Memory keeps growing | `Memory` not released, or memory allocated by native side has not had `free` called |

## References

- [JNA official documentation and API](https://java-native-access.github.io/jna/5.14.0/javadoc/)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNA Structure usage instructions](https://github.com/java-native-access/jna/blob/master/www/StructuresAndUnions.md)