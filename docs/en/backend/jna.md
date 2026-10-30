---
isTimeLine: true
title: "JNA: Calling Native Libraries from Java in Practice"
description: JNA’s invocation model, type and struct mapping, memory and threading considerations, and trade-offs versus JNI and the FFM API finalized in JDK 22. Covers API changes after JNA 5.x (loadLibrary deprecated) and common pitfalls.
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
    content: JNA,Java Native Access,JNI,FFM API,Calling a DLL from Java,Structure Mapping
translatedFrom: c3bf90f88a86b471
---
The need for Java to call C/C++ dynamic libraries is usually unavoidable once it arises: hardware SDKs only provide `.so`/`.dll`, legacy company encryption libraries exist, and some capability is not wrapped in the JDK at all. When there is no way around it, there are only three options.

The cost of choosing wrong is not a compilation error, but having to redo everything every time you upgrade the JDK or switch platforms. Below, I’ll first give the selection conclusion, then explain JNA’s invocation model and the pitfalls you’ll actually hit.

## When should you use JNA

There are only three options:

| Approach | Performance | Suitable for |
|---|---|---|
| JNI | Highest | Being able to accept maintaining C bridge code |
| **JNA** | Medium (reflection and invocation overhead) | Not wanting to touch C, quickly integrating existing libraries |
| **FFM** (`java.lang.foreign`) | High (close to JNI) | New projects on JDK 22+ |

JNI requires writing your own C header and bridge layer; JNA and FFM do not.

The FFM API became official in JDK 22 (it was preview in JDK 21 and earlier), and JDK 25 has become LTS. Therefore, **new projects on JDK 22+ should prioritize evaluating FFM**, while JNA is more suitable for existing projects or scenarios that need its advanced features (automatic struct mapping, callbacks, `Pointer` arithmetic).

## 1. Loading the library

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

| Platform | File actually looked up |
|---|---|
| Linux | `libmylib.so` |
| macOS | `libmylib.dylib` |
| Windows | `mylib.dll` |

The search path comes from `jna.library.path`, `java.library.path`, and system default paths. When it cannot be found, the exception message lists all filenames attempted, so you can check them directly.

Explicitly specify a full path or options:

```java
Map<String, Object> opts = new HashMap<>();
opts.put(Library.OPTION_STRING_ENCODING, "UTF-8");   // 默认用系统编码，中文环境常踩坑
opts.put(Library.OPTION_CALLING_CONVENTION, 0);      // stdcall=0(Windows 需注意)
MyLib lib = Native.load("/opt/mylib/libmylib.so", MyLib.class, opts);
```

`OPTION_STRING_ENCODING` deserves a separate mention: JNA by default converts `String` using the platform default charset. On Windows in a GBK environment, this will pass UTF-8 to native functions, manifesting as “Chinese characters turning into garbled text.”

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
| `int[]` | `int*` (arrays are passed by address) |

**`long` is the biggest pitfall**: C’s `long` is 8 bytes on 64-bit Linux and 4 bytes on Windows (LP64 vs LLP64). Java’s `long` is always 8 bytes, so:

- If the native parameter is C `long` and runs on Windows → use `int` on the Java side
- If you want semantics independent of platform → use `NativeLong` on the Java side, or directly change the native interface to use `int64_t`

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

1. **Field order must match the C struct**; if `@FieldOrder` is omitted, reflection order is used (unreliable). After JNA 5, explicit declaration is required.
2. **`Structure` has two memory views**: the Java object and native memory. Before invocation, call `write()` to synchronize Java fields to native memory; after invocation, call `read()` to synchronize back. Use `Structure.ByReference` / `ByValue` to specify the passing mode.
3. **Structs cannot contain Java reference types** (except `String`, which is handled as `char*`); nested structs must use instances of the same type.

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

If `throws` is not declared, no exception will be thrown; it will only silently return the error value—this is an easy link to miss during troubleshooting.

## 5. Performance and memory

Every JNA call has the overhead of crossing the JNI boundary plus reflective dispatch, on the order of microseconds. Optimization directions:

| Measure | Description |
|---|---|
| Reduce the number of calls | Pass arrays in batches instead of calling once per loop iteration |
| Allocate directly with `Memory` | `new Memory(size)` allocates off-heap memory; use it with `Pointer` reads/writes to avoid `byte[]` copying |
| Avoid frequently creating `Structure` | Struct objects can be reused; after changing fields, just call `write()` |
| Disable type-checking overhead | Production environments generally require no extra handling; do not enable `OPTION_ALLOW_OBJECTS` in `Native.load` |

**Two sources of memory leaks**:

1. Memory allocated by `Memory` / `Native.malloc` is released by GC or `dispose()`; if it is held continuously in a long-lived object, it will grow.
2. Memory allocated by the native library itself and returned as a pointer is not JNA’s responsibility to release; you must call the corresponding `free` function.

## 6. Callbacks and threads

```java
public interface MyCallback extends Callback {
    void invoke(int result);
}
```

The callback object must be held by a strong reference (usually a static field or container member); otherwise, after it is reclaimed by GC, a subsequent call from the native side will directly crash the JVM. This is JNA’s most typical crash cause.

Regarding threads: JNA itself does not synchronize; whether the native library is thread-safe depends entirely on the library itself. The same `Library` instance can be shared across multiple threads (method calls themselves are independent), but shared `Structure`/`Memory` instances require your own locking.

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

- FFM is built into the JDK and requires no third-party dependency; JNA requires an additional jar.
- FFM has lower invocation overhead, and memory lifetime is explicitly managed by `Arena`, so there is no “forgot to free” situation.
- JNA’s automatic struct mapping is more convenient; FFM requires manually calculating `MemoryLayout`, resulting in more boilerplate code.

Selection advice: for new projects on JDK 22+, use FFM; if there is already a large amount of JNA code, or you need automatic struct mapping and rich community wrappers (such as the Windows API in `jna-platform`), continue using JNA.

## 8. Troubleshooting checklist

| Symptom | Common cause |
|---|---|
| `UnsatisfiedLinkError: no xxx in java.library.path` | Wrong library name/path, or a dependent .so is missing (check with `ldd`) |
| JVM crashes after invocation (hs_err_pid) | Callback object was GC’d, or struct memory layout does not match C |
| Return value is obviously wrong | `long` width mismatch (Windows C long is 4 bytes) |
| Chinese garbled text | `OPTION_STRING_ENCODING` is not set to UTF-8 |
| Memory keeps growing | `Memory` was not released, or memory allocated on the native side did not call `free` |

## References

- [JNA official documentation and API](https://java-native-access.github.io/jna/5.14.0/javadoc/)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNA Structure usage instructions](https://github.com/java-native-access/jna/blob/master/www/StructuresAndUnions.md)