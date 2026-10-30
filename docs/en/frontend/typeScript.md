---
isTimeLine: true
title: TypeScript and ES6 Syntax Essentials
description: "Practical use of the TypeScript type system and ES6+ syntax: must-enable strict options in tsconfig, the difference between unknown and any, type narrowing patterns, and key details of common syntax such as arrow function this, destructuring, and modules."
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
translatedFrom: 13d5bf04cf075ce3
---
Introducing TypeScript into a project usually feels comfortable for the first few weeks; a few months later, people start complaining that they can never finish writing types.

This post isn't a comprehensive grammar reference — it covers just two things: which compiler options are worth enabling from the start, and which patterns are most likely to cause trouble in real projects.

## What TypeScript Brings, and What It Costs

TypeScript adds a **compile-time** type system on top of JavaScript:

- **Benefits**: the editor can autocomplete and jump to definitions, you can locate all references when refactoring, and some runtime errors get caught at compile time
- **Costs**: an extra compile/build step; when third-party libraries lack types you have to write `d.ts` yourself; over-engineering types slows development down

Key fact: **types are completely erased after compilation**. The output is plain JavaScript with no type checking at runtime. So don't expect the type system to block invalid data — JSON returned by APIs still needs validation.

## 1. tsconfig Options Worth Enabling First

| Option | Suggested value | Reason |
|---|---|---|
| `strict` | `true` | Turns on the group of checks below in one go; the default baseline for new projects |
| `noImplicitAny` | implied by strict | Disallows implicit any, preventing types from silently degrading |
| `strictNullChecks` | implied by strict | `null`/`undefined` can no longer be assigned to arbitrary types |
| `noUncheckedIndexedAccess` | `true` | Array index access returns `T \| undefined`, forcing you to handle out-of-bounds cases |
| `target` | `ES2022` or higher | Determines how far syntax gets downleveled |
| `moduleResolution` | `bundler` (frontend) | Matches Vite/webpack resolution rules |
| `skipLibCheck` | `true` | Skips type checking of `node_modules`, noticeably speeding up builds |

The most common error after turning on `strict` is "object is possibly null" — that's not noise; it's making you handle edge cases explicitly.

## 2. Common Type System Patterns

### 2.1 Interfaces and Type Aliases

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

The two are interchangeable in most scenarios. The difference: `interface` supports declaration merging (same-named declarations automatically combine), making it suitable for describing extensible object structures; `type` can express unions, conditional types, and other forms that `interface` cannot.

### 2.2 Unions and Intersections

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

Literal unions are better suited to the frontend than `enum`: smaller output, and you can compare directly against strings.

### 2.3 Generics and Constraints

```typescript
function first<T>(list: T[]): T | undefined {
  return list[0]
}

function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

Here `extends` expresses a constraint (the minimum shape T must satisfy), not inheritance.

### 2.4 Type Narrowing

TypeScript automatically narrows types based on control flow:

```typescript
function format(v: string | number | Date): string {
  if (typeof v === 'string') return v            // string
  if (typeof v === 'number') return String(v)    // number
  return v.toISOString()                          // Date
}
```

Custom type guards — the return type must be written as `v is Person` for the compiler to recognize it:

```typescript
function isPerson(v: unknown): v is Person {
  return typeof v === 'object' && v !== null && 'firstName' in v
}
```

### 2.5 `unknown` vs `any`

- `any`: gives up checking and infects every downstream variable
- `unknown`: means "not known yet"; you must narrow it before use

External input (`JSON.parse`, event callbacks, `fetch` return values) should be declared as `unknown` and then validated. That's how you put the type system to its best use.

---

## 3. Key ES6+ Syntax Points

### 3.1 `let` / `const` and the Temporal Dead Zone

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` only guarantees the **binding** doesn't change; the object's internals can still be modified. Also, accessing a `let`/`const` variable before its declaration throws a `ReferenceError` (the temporal dead zone), unlike `var`, which yields `undefined`.

### 3.2 Arrow Functions and `this`

```javascript
const add = (a, b) => a + b
```

The key difference: arrow functions **have no `this` of their own**; they capture the enclosing `this` from where they're defined. So:

- Want the outer `this` inside a callback → use an arrow function
- Need a dynamic `this` (object methods, methods in Vue's Options API) → use `function`

Arrow functions also can't be called with `new`, and they have no `arguments`.

### 3.3 Template Literals and Destructuring

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

Destructuring is often used for function parameters; combined with default values it saves a ton of null checks:

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 Spread and Rest

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

Note: object spread is a **shallow copy**; nested objects still share the same reference.

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

`class` is syntactic sugar over prototype inheritance, but there are behavioral differences: class bodies are in strict mode by default, methods are non-enumerable, and the class must be invoked with `new`.

### 3.6 Promises and async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

An `async` function always returns a Promise; `await` only pauses the current function and doesn't block the thread. For concurrent work use `Promise.all` — don't write serial `await`s. That's the most common performance problem.

### 3.7 Modules

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM is statically analyzed, so `import` must be at the top level; bundlers rely on this for tree-shaking. When mixing with CommonJS, note that `__dirname` and `require` don't exist in ESM.

---

## 4. Common Pitfalls

1. **`any` contagion**: once an `any` variable takes part in an operation, the result is also `any`, and type checking breaks down from there. Prefer `unknown` plus validation.
2. **Abusing `as` assertions**: `as` does no runtime checking; if you get it wrong, it still compiles and only blows up at runtime. Rely on narrowing rather than assertions.
3. **`enum` output**: a regular `enum` generates a runtime object (extra size plus unexpected behavior); in the vast majority of cases, replace it with a literal union.
4. **Optional properties vs `undefined`**: under `exactOptionalPropertyTypes`, `{ a?: string }` and `{ a: string | undefined }` have different semantics — the former means "the key may be absent."
5. **`for...in` on arrays**: it iterates over keys on the prototype chain too; for arrays, always use `for...of` or `forEach`.

## References

- [TypeScript Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Full tsconfig option reference](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 specification](https://262.ecma-international.org/6.0/)