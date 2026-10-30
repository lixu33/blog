---
isTimeLine: true
title: TypeScript and ES6 Syntax Essentials
description: "Practical use of the TypeScript type system and ES6+ syntax: required strict options in tsconfig, the difference between unknown and any, type narrowing patterns, and key details of common syntax such as arrow function this, destructuring, and modules."
date: 2024-05-23
updated: 2026-10-31
tags:
- TypeScript
- ES6
- Frontend
categories:
- Frontend Technology
- Frontend
- Frontend
head:
- - meta
  - name: keywords
    content: TypeScript,ES6,tsconfig,strict mode,Type narrowing,Generics,Arrow function
translatedFrom: ccdfc79bb9e7947b
---
# TypeScript and ES6 Syntax Essentials

TypeScript's syntax documentation is quite comprehensive; what really takes time is configuration and type boundaries: turn `strict` on and the screen fills with errors, third-party library types don't match, and `any` silently spreads out from some callback.

This post is organized into four parts—compiler options → type system → ES6 syntax → common pitfalls—and the examples are meant to be usable directly in a project.

## What TypeScript Brings and What It Costs

TypeScript adds a **compile-time** type system on top of JavaScript:

- **Benefits**: the editor can provide completion and navigation, you can locate all references when refactoring, and some runtime errors are moved to compile time
- **Costs**: an extra compile/build step; when third-party libraries lack types, you have to write `d.ts` yourself; overdoing types can slow development

Key fact: **types are completely erased after compilation**; the output is plain JavaScript, and there is no type checking at runtime. So don't expect the type system to block invalid data—JSON returned by an API still needs validation.

## 1. tsconfig Options Worth Enabling First

| Option | Recommended value | Reason |
|---|---|---|
| `strict` | `true` | Enables the following group of checks at once; the default baseline for new projects |
| `noImplicitAny` | brought in by strict | Disallows implicit any, preventing silent type degradation |
| `strictNullChecks` | brought in by strict | `null`/`undefined` can no longer be assigned to arbitrary types |
| `noUncheckedIndexedAccess` | `true` | Array index access returns `T \| undefined`, forcing you to handle out-of-bounds |
| `target` | `ES2022` or higher | Determines the degree of syntax downleveling |
| `moduleResolution` | `bundler` (frontend) | Matches Vite/webpack resolution rules |
| `skipLibCheck` | `true` | Skips type checking of `node_modules`, significantly speeding up builds |

After enabling `strict`, the most common error is “Object is possibly null”—this isn't noise; it's making you handle boundaries explicitly.

## 2. Common Type System Patterns

### 2.1 Interfaces and Type Aliases

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

The two are interchangeable in most scenarios. The difference: `interface` supports declaration merging (same-name declarations automatically combine), making it suitable for describing extensible object structures; `type` can express unions, conditional types, and other forms that `interface` cannot.

### 2.2 Unions and Intersections

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

Literal unions are better suited to the frontend than `enum`: the output is smaller, and you can compare strings directly.

### 2.3 Generics and Constraints

```typescript
function first<T>(list: T[]): T | undefined {
  return list[0]
}

function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

`extends` here means a constraint (the minimum shape T must satisfy), not inheritance.

### 2.4 Type Narrowing

TypeScript automatically narrows types based on control flow:

```typescript
function format(v: string | number | Date): string {
  if (typeof v === 'string') return v            // string
  if (typeof v === 'number') return String(v)    // number
  return v.toISOString()                          // Date
}
```

For a custom type guard, the return type must be written as `v is Person` for the compiler to recognize it:

```typescript
function isPerson(v: unknown): v is Person {
  return typeof v === 'object' && v !== null && 'firstName' in v
}
```

### 2.5 `unknown` vs. `any`

- `any`: gives up checking and infects all downstream variables
- `unknown`: means “not known yet”; you must narrow it before use

External input (`JSON.parse`, event callbacks, `fetch` return values) should be declared as `unknown` and then validated. This is how to use the type system where it matters most.

---

## 3. Key ES6+ Syntax Points

### 3.1 `let` / `const` and the Temporal Dead Zone

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` only guarantees that the **binding** doesn't change; the object's internals can still be modified. Also, accessing a variable declared with `let`/`const` before its declaration throws a `ReferenceError` (the temporal dead zone), unlike `var`, which yields `undefined`.

### 3.2 Arrow Functions and `this`

```javascript
const add = (a, b) => a + b
```

Key difference: arrow functions **do not have their own `this`**; they capture the outer `this` at definition time. Therefore:

- To use the outer `this` inside a callback → use an arrow function
- When you need dynamic `this` (object methods, methods in Vue's Options API) → use `function`

Arrow functions also cannot be called with `new` and do not have `arguments`.

### 3.3 Template Literals and Destructuring

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

Destructuring is often used for function parameters; combined with default values, it eliminates a lot of null checks:

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 Spread and Rest

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

Note: object spread is a **shallow copy**; nested objects remain the same reference.

### 3.5 Classes and Inheritance

```javascript
class Animal {
  constructor(name) {
    this.name = name
  }
  move(meters) {
    console.log(`${this.name} moved ${meters}m.`)
  }
}

class Dog extends Animal {
  bark() {
    console.log('Woof!')
  }
}
```

`class` is syntactic sugar over prototype inheritance, but there are behavioral differences: class bodies are in strict mode by default, methods are non-enumerable, and classes must be called with `new`.

### 3.6 Promises and async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

An `async` function always returns a Promise; `await` only pauses the current function and does not block the thread. For concurrent scenarios use `Promise.all`; don't write sequential `await`s—this is the most common performance problem.

### 3.7 Modules

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM is statically analyzed; `import` must be at the top level, and bundlers use this for tree-shaking. When mixing with CommonJS, note that `__dirname` and `require` do not exist in ESM.

---

## 4. Common Pitfalls

1. **`any` contagion**: When an `any` variable participates in an operation, the result is also `any`, and type checking fails all the way down. Prefer `unknown` plus validation.
2. **Overusing `as` assertions**: `as` performs no runtime check; if you get it wrong, compilation still passes, and it only blows up at runtime. Rely on narrowing rather than assertions where possible.
3. **`enum` output**: A regular `enum` generates a runtime object (extra size + unexpected behavior); in the vast majority of cases, use a literal union instead.
4. **Optional properties vs. `undefined`**: `{ a?: string }` and `{ a: string | undefined }` have different semantics under `exactOptionalPropertyTypes`; the former means “the key may be absent.”
5. **Array `for...in`**: It iterates over keys on the prototype chain; for arrays, always use `for...of` or `forEach`.

## References

- [TypeScript Official Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Full tsconfig option reference](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 specification](https://262.ecma-international.org/6.0/)