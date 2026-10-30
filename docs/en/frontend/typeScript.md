---
isTimeLine: true
title: TypeScript and ES6 Syntax Essentials
description: "Practical use of the TypeScript type system and ES6+ syntax: essential strict options in tsconfig, the difference between unknown and any, type narrowing patterns, and key details of common syntax such as arrow function `this`, destructuring, and modules."
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
    content: TypeScript,ES6,tsconfig,Strict mode,Type narrowing,Generics,Arrow functions
translatedFrom: e395da88aba9915f
---
## What TypeScript brings, and what it costs

TypeScript adds a **compile-time** type system on top of JavaScript:

- **Benefits**: the editor can autocomplete and navigate, refactoring can locate all references, and some runtime errors move to compile time
- **Costs**: an extra compile/build step; when third-party libraries lack types, you have to supply `d.ts` yourself; overdoing types slows down development

Key fact: **types are completely erased after compilation**, and the output is plain JavaScript with no runtime type checking. So don't expect the type system to block invalid data—JSON returned by the API still needs validation.

## 1. tsconfig Options Worth Enabling First

| Option | Recommended value | Reason |
|---|---|---|
| `strict` | `true` | Turns on the group of checks below at once; the default prerequisite for new projects |
| `noImplicitAny` | Brought in by strict | Disallows implicit any and prevents silent type degradation |
| `strictNullChecks` | Brought in by strict | `null`/`undefined` can no longer be assigned to any type |
| `noUncheckedIndexedAccess` | `true` | Array index access returns `T \| undefined`, forcing you to handle out-of-bounds access |
| `target` | `ES2022` or higher | Determines the degree of syntax downleveling |
| `moduleResolution` | `bundler` (frontend) | Matches Vite/webpack resolution rules |
| `skipLibCheck` | `true` | Skips type checking of `node_modules`, noticeably speeding up builds |

After `strict` is enabled, the most common error is "object may be null"—this is not noise; it is making you handle boundaries explicitly.

## 2. Common Type System Patterns

### 2.1 Interfaces and type aliases

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

The two are interchangeable in most scenarios. Difference: `interface` supports declaration merging (same-name declarations merge automatically), suitable for describing extensible object structures; `type` can express union types, conditional types, and other forms that `interface` cannot.

### 2.2 Unions and intersections

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

Literal unions are more suitable for frontend than `enum`: smaller output, and you can compare them directly as strings.

### 2.3 Generics and constraints

```typescript
function first<T>(list: T[]): T | undefined {
  return list[0]
}

function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

`extends` here means a constraint (what shape T must at least satisfy), not inheritance.

### 2.4 Type narrowing

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
- `unknown`: means "not known yet"; it must be narrowed before use

External input (`JSON.parse`, event callbacks, `fetch` return values) should be declared as `unknown`, then validated. This is how you use the type system where it matters.

---

## 3. Key ES6+ Syntax Points

### 3.1 `let` / `const` and the temporal dead zone

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` only guarantees the **binding** does not change; object contents can still be modified. Also, variables declared with `let`/`const` throw `ReferenceError` if accessed before declaration (the temporal dead zone), unlike `var`, which yields `undefined`.

### 3.2 Arrow functions and `this`

```javascript
const add = (a, b) => a + b
```

Key difference: arrow functions **do not have their own `this`**; they capture the outer `this` at definition time. So:

- Want outer `this` inside a callback → use an arrow function
- Need dynamic `this` (object methods, Vue Options API methods) → use `function`

Arrow functions also cannot be called with `new`, and they have no `arguments`.

### 3.3 Template literals and destructuring

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

Destructuring is often used for function parameters; combined with default values, it saves a bunch of null checks:

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 Spread and rest

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

Note: object spread is a **shallow copy**; nested objects remain the same reference.

### 3.5 Classes and inheritance

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

`class` is syntactic sugar over prototype inheritance, but behavior differs: classes are in strict mode by default internally, methods are non-enumerable, and they must be called with `new`.

### 3.6 Promises and async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

`async` functions always return a Promise; `await` only pauses the current function, not the thread. For concurrency use `Promise.all`, don't write serial `await`—this is the most common performance issue.

### 3.7 Modules

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM is statically parsed; `import` must be at the top level, and bundlers use that for tree-shaking. When mixing with CommonJS, note that `__dirname` and `require` do not exist in ESM.

---

## 4. Common Pitfalls

1. **`any` infection**: if an `any` variable participates in an operation, the result is also `any`, and type checking fails all the way down. Better to use `unknown` plus validation.
2. **Overuse of `as` assertions**: `as` does no runtime checks; if you get it wrong, compilation still passes and it only blows up at runtime. Rely on narrowing rather than assertions as much as possible.
3. **Output of `enum`**: regular `enum` generates a runtime object (extra size + unexpected behavior); in most scenarios replace it with literal unions.
4. **Optional properties vs `undefined`**: `{ a?: string }` and `{ a: string | undefined }` have different semantics under `exactOptionalPropertyTypes`; the former means "this key may be absent".
5. **Array `for...in`**: iterates over keys on the prototype chain; for arrays always use `for...of` or `forEach`.

## References

- [TypeScript official handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Full tsconfig option reference](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 specification](https://262.ecma-international.org/6.0/)