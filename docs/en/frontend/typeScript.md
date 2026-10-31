---
isTimeLine: true
title: TypeScript and ES6 Syntax Essentials
description: "Practical uses of the TypeScript type system and ES6+ syntax: must-enable strict options in tsconfig, the difference between unknown and any, type narrowing patterns, and key details of common syntax such as arrow function this, destructuring, and modules."
date: 2024-05-23
updated: 2026-10-31
tags:
- TypeScript
- ES6
- Frontend
categories:
- Frontend technology
- Frontend
- Frontend
head:
- - meta
  - name: keywords
    content: TypeScript,ES6,tsconfig,strict mode,Type narrowing,generics,Arrow functions
translatedFrom: eb8c1aa23c461c96
---
# TypeScript and ES6 Syntax Essentials

TypeScript's syntax documentation is thorough; what actually takes time is configuration and type boundaries: turn `strict` on and the screen fills with errors, third-party libraries' types don't line up, and `any` quietly spreads out from some callback.

These notes are organized in four sections — "compiler options → type system → ES6 syntax → common pitfalls" — and every example is meant to be usable directly in a project.

## What TypeScript Gives You, and What It Costs

TypeScript adds a **compile-time** type system on top of JavaScript:

- **Benefits**: the editor can autocomplete and jump to definitions, refactoring can locate every reference, and some runtime errors are moved up to compile time
- **Costs**: an extra compile/build step; when third-party libraries lack types you have to write `d.ts` yourself; over-engineering types slows development down

The key fact: **types are completely erased after compilation**. The output is plain JavaScript, with no type checking at runtime. So don't count on the type system to block invalid data — JSON returned by an API still needs validation.

## 1. tsconfig Options Worth Enabling First

| Option | Suggested value | Reason |
|---|---|---|
| `strict` | `true` | Turns on the group of checks below at once; the default prerequisite for new projects |
| `noImplicitAny` | pulled in by strict | Bans implicit any, preventing silent type degradation |
| `strictNullChecks` | pulled in by strict | `null`/`undefined` can no longer be assigned to arbitrary types |
| `noUncheckedIndexedAccess` | `true` | Array index access returns `T \| undefined`, forcing you to handle out-of-bounds |
| `target` | `ES2022` or higher | Determines how far syntax is downleveled |
| `moduleResolution` | `bundler` (frontend) | Matches Vite/webpack resolution rules |
| `skipLibCheck` | `true` | Skips type checking of `node_modules`, noticeably speeding up builds |

The most common error after turning on `strict` is "object is possibly null" — that's not noise, it's telling you to handle the boundary explicitly.

## 2. Common Type System Patterns

### 2.1 Interfaces and Type Aliases

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

The two are interchangeable in most situations. The difference: `interface` supports declaration merging (same name automatically combines), making it suitable for describing extensible object structures; `type` can express unions, conditional types, and other forms `interface` can't.

### 2.2 Unions and Intersections

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

Literal unions are better suited to the frontend than `enum`: smaller output, and you can compare strings directly.

### 2.3 Generics and Constraints

```typescript
function first<T>(list: T[]): T | undefined {
  return list[0]
}

function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

Here `extends` means a constraint (the minimum shape T must satisfy), not inheritance.

### 2.4 Type Narrowing

TypeScript automatically narrows types based on control flow:

```typescript
function format(v: string | number | Date): string {
  if (typeof v === 'string') return v            // string
  if (typeof v === 'number') return String(v)    // number
  return v.toISOString()                          // Date
}
```

For a custom type guard, the return type must be written as `v is Person` for the compiler to accept it:

```typescript
function isPerson(v: unknown): v is Person {
  return typeof v === 'object' && v !== null && 'firstName' in v
}
```

### 2.5 `unknown` and `any`

- `any`: gives up checking, and it infects every downstream variable
- `unknown`: means "don't know yet"; it must be narrowed before use

External input (`JSON.parse`, event callbacks, `fetch` return values) should be declared as `unknown` and then validated. This is how you put the type system where it actually matters.

---

## 3. ES6+ Syntax Essentials

### 3.1 `let` / `const` and the Temporal Dead Zone

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` only guarantees the **binding** doesn't change; the object's internals can still be modified. Also, accessing a `let`/`const` variable before its declaration throws a `ReferenceError` (the temporal dead zone), unlike `var`, which gives you `undefined`.

### 3.2 Arrow Functions and `this`

```javascript
const add = (a, b) => a + b
```

The key difference: arrow functions **have no `this` of their own**; they capture the outer `this` at definition time. So:

- Want the outer `this` inside a callback → use an arrow function
- Need dynamic `this` (object methods, methods in Vue's Options API) → use `function`

Arrow functions also can't be called with `new` and have no `arguments`.

### 3.3 Template Strings and Destructuring

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

Destructuring is often used for function parameters; combined with default values it eliminates a pile of null checks:

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 Spread and Rest

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

Note: object spread is a **shallow copy**; nested objects are still the same reference.

### 3.5 class and Inheritance

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

`class` is syntactic sugar over prototype inheritance, but behavior differs: class bodies are in strict mode by default, methods are non-enumerable, and `new` is required to call them.

### 3.6 Promise and async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

An `async` function always returns a Promise; `await` only pauses the current function and doesn't block the thread. For concurrent work use `Promise.all` — don't write serial `await`s, which is the most common performance problem.

### 3.7 Modules

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM is statically parsed, so `import` must be at the top level, which is what lets bundlers do tree-shaking. When mixing with CommonJS, note that `__dirname` and `require` don't exist in ESM.

---

## 4. Common Pitfalls

1. **`any` contagion**: once an `any` variable takes part in an operation, the result is also `any`, and type checking fails all the way down. Prefer `unknown` plus validation.
2. **Overusing `as` assertions**: `as` performs no runtime check; a wrong assertion still compiles and only blows up at runtime. Rely on narrowing rather than assertions.
3. **`enum` output**: a plain `enum` generates a runtime object (extra size + unexpected behavior); in the vast majority of cases, use a literal union instead.
4. **Optional properties vs `undefined`**: `{ a?: string }` and `{ a: string | undefined }` have different semantics under `exactOptionalPropertyTypes`; the former means "this key may be absent."
5. **`for...in` on arrays**: it iterates keys on the prototype chain; for arrays always use `for...of` or `forEach`.

## Related Reading

- [Getting Started with Full-Stack Next.js Apps](/en/frontend/nextjs): how these syntax features are actually used in a framework
- [Getting Started with Caddy: Automatic HTTPS and Reverse Proxy](/en/devops/caddy): hosting and caching static output

## References

- [TypeScript Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Full tsconfig option reference](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 Specification](https://262.ecma-international.org/6.0/)