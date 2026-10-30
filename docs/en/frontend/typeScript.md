---
isTimeLine: true
title: TypeScript and ES6 Syntax Essentials
description: "Practical usage of the TypeScript type system and ES6+ syntax: essential strict options in tsconfig, differences between unknown and any, type narrowing patterns, and key details of common syntax such as arrow function this, destructuring, and modules."
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
    content: TypeScript,ES6,tsconfig,strict mode,Type narrowing,Generics,Arrow functions
translatedFrom: 872fa903fb100fc3
---
This post covers TypeScript compiler options and commonly used ES6 syntax, focusing on the places that tend to cause problems in real projects rather than providing an exhaustive grammar reference.

## What TypeScript Gives You, and What It Costs

TypeScript adds a **compile-time** type system on top of JavaScript:

- **Benefits**: the editor can autocomplete and jump to definitions, refactoring can locate every reference, and some runtime errors surface at compile time
- **Costs**: an extra compile/build step; when a third-party library lacks types you have to write `d.ts` yourself; over-engineering types slows development down

Key fact: **types are completely erased after compilation**. The output is plain JavaScript, and there is no type checking at runtime. So don't expect the type system to block invalid data — you still have to validate the JSON your API returns.

## 1. tsconfig Options Worth Enabling First

| Option | Recommended value | Why |
|---|---|---|
| `strict` | `true` | Turns on the group of checks below in one go; the default baseline for new projects |
| `noImplicitAny` | Included by strict | Bans implicit any and prevents types from silently degrading |
| `strictNullChecks` | Included by strict | `null`/`undefined` can no longer be assigned to any type |
| `noUncheckedIndexedAccess` | `true` | Indexing into an array returns `T \| undefined`, forcing you to handle out-of-bounds access |
| `target` | `ES2022` or higher | Determines how far syntax gets downleveled |
| `moduleResolution` | `bundler` (frontend) | Matches the resolution rules of Vite/webpack |
| `skipLibCheck` | `true` | Skips type checking of `node_modules`, noticeably speeding up builds |

Once `strict` is on, the most common error you'll see is "object is possibly null" — that's not noise; it's forcing you to handle boundaries explicitly.

## 2. Common Type System Patterns

### 2.1 Interfaces and Type Aliases

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

The two are interchangeable in most cases. The differences: `interface` supports declaration merging (same-name declarations are automatically combined), which suits describing extensible object shapes; `type` can express union types, conditional types, and other forms `interface` can't.

### 2.2 Unions and Intersections

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

Literal unions are a better fit for the frontend than `enum`: smaller output, and you can compare directly against strings.

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

TypeScript narrows types automatically based on control flow:

```typescript
function format(v: string | number | Date): string {
  if (typeof v === 'string') return v            // string
  if (typeof v === 'number') return String(v)    // number
  return v.toISOString()                          // Date
}
```

For custom type guards, the return type must be written as `v is Person` for the compiler to buy it:

```typescript
function isPerson(v: unknown): v is Person {
  return typeof v === 'object' && v !== null && 'firstName' in v
}
```

### 2.5 `unknown` vs. `any`

- `any`: gives up checking, and the contamination spreads to every downstream variable
- `unknown`: means "don't know yet"; you must narrow it before use

External input (`JSON.parse`, event callbacks, `fetch` return values) should be declared as `unknown` and then validated. That's how you put the type system where it actually matters.

---

## 3. Key Points of Commonly Used ES6+ Syntax

### 3.1 `let` / `const` and the Temporal Dead Zone

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` only guarantees the **binding** doesn't change; the object's contents can still be mutated. Also, accessing a `let`/`const` variable before its declaration throws a `ReferenceError` (the temporal dead zone), unlike `var`, which just gives you `undefined`.

### 3.2 Arrow Functions and `this`

```javascript
const add = (a, b) => a + b
```

The key difference: arrow functions **have no `this` of their own**; they capture the enclosing `this` at definition time. So:

- Need the outer `this` inside a callback → use an arrow function
- Need a dynamic `this` (object methods, methods in Vue's Options API) → use `function`

Arrow functions also can't be called with `new`, and they have no `arguments`.

### 3.3 Template Strings and Destructuring

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

Destructuring is often used for function parameters; combined with default values it saves you a pile of null checks:

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 Spread and Rest

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

Note: object spread is a **shallow copy**; nested objects remain the same references.

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

`class` is syntactic sugar over prototypal inheritance, but the behavior differs: class bodies are in strict mode by default, methods are non-enumerable, and a class must be called with `new`.

### 3.6 Promises and async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

An `async` function always returns a Promise; `await` only pauses the current function and doesn't block the thread. For concurrent work use `Promise.all` — chaining serial `await`s instead is the most common performance problem.

### 3.7 Modules

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM is statically analyzed, so `import` must be at the top level, which is what lets bundlers do tree-shaking. When mixing with CommonJS, remember that `__dirname` and `require` don't exist in ESM.

---

## 4. Where Things Commonly Go Wrong

1. **`any` contamination**: once an `any` variable takes part in an operation, the result is `any` too, and type checking fails all the way down. Prefer `unknown` plus validation.
2. **Overusing `as` assertions**: `as` performs no runtime check; if you get it wrong it still compiles and only blows up at runtime. Lean on narrowing rather than assertions.
3. **What `enum` emits**: a plain `enum` generates a runtime object (extra bytes plus unexpected behavior); in the vast majority of cases use a literal union instead.
4. **Optional properties vs. `undefined`**: `{ a?: string }` and `{ a: string | undefined }` have different semantics under `exactOptionalPropertyTypes`; the former means "the key can be absent".
5. **`for...in` over arrays**: it walks keys on the prototype chain too; for arrays always use `for...of` or `forEach`.

## References

- [TypeScript Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Full list of tsconfig options](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 specification](https://262.ecma-international.org/6.0/)