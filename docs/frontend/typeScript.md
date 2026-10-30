---
isTimeLine: true
title: TypeScript 与 ES6 语法要点
description: TypeScript 类型系统与 ES6+ 语法的实际用法：tsconfig 必开的 strict 选项、unknown 与 any 的区别、类型收窄写法，以及箭头函数 this、解构、模块等常用语法的关键细节。
date: 2024-05-23
updated: 2026-10-31
tags:
- TypeScript
- ES6
- 前端
categories:
- 前端技术
- Frontend
- 前端
head:
- - meta
  - name: keywords
    content: TypeScript, ES6, tsconfig, strict 模式, 类型收窄, 泛型, 箭头函数
---

## TypeScript 带来什么，代价是什么

TypeScript 在 JavaScript 之上加了一层**编译期**类型系统：

- **收益**：编辑器能补全和跳转、重构时能定位所有引用、把一部分运行时错误提前到编译期
- **代价**：多一个编译/构建步骤；第三方库缺类型时要自己补 `d.ts`；类型写过头会拖慢开发

关键事实：**类型在编译后被完全擦除**，产物是普通 JavaScript，运行时没有任何类型检查。所以别指望类型系统挡住非法数据——接口返回的 JSON 该校验还是要校验。

## 一、tsconfig 里值得先开的选项

| 选项 | 建议值 | 原因 |
|---|---|---|
| `strict` | `true` | 一次开启下面这一组检查，是新项目的默认前提 |
| `noImplicitAny` | 由 strict 带入 | 禁止隐式 any，避免类型静默退化 |
| `strictNullChecks` | 由 strict 带入 | `null`/`undefined` 不再能赋给任意类型 |
| `noUncheckedIndexedAccess` | `true` | 数组下标访问返回 `T \| undefined`，逼你处理越界 |
| `target` | `ES2022` 或更高 | 决定语法降级程度 |
| `moduleResolution` | `bundler`（前端） | 与 Vite/webpack 的解析规则一致 |
| `skipLibCheck` | `true` | 跳过 `node_modules` 的类型检查，明显加快构建 |

`strict` 打开后最常见的报错是「对象可能为 null」——这不是噪音，是让你显式处理边界。

## 二、类型系统常用写法

### 2.1 接口与类型别名

```typescript
interface Person {
  firstName: string
  lastName: string
}

type Point = { x: number; y: number }
```

两者多数场景可互换。区别：`interface` 可以声明合并（同名自动叠加），适合描述可扩展的对象结构；`type` 能表达联合类型、条件类型等 `interface` 做不到的形式。

### 2.2 联合与交叉

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'  // 字面量联合，比 enum 更轻
type WithId = { id: string }
type User = WithId & { name: string }                   // 交叉类型 = 同时满足
```

字面量联合比 `enum` 更适合前端：产物更小，且能直接用字符串比较。

### 2.3 泛型与约束

```typescript
function first<T>(list: T[]): T | undefined {
  return list[0]
}

function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}
```

`extends` 在这里表示约束（T 至少满足什么形状），不是继承。

### 2.4 类型收窄

TypeScript 会根据控制流自动收窄类型：

```typescript
function format(v: string | number | Date): string {
  if (typeof v === 'string') return v            // string
  if (typeof v === 'number') return String(v)    // number
  return v.toISOString()                          // Date
}
```

自定义类型守卫，返回类型写成 `v is Person` 才能让编译器认账：

```typescript
function isPerson(v: unknown): v is Person {
  return typeof v === 'object' && v !== null && 'firstName' in v
}
```

### 2.5 `unknown` 与 `any`

- `any`：放弃检查，并会传染给所有下游变量
- `unknown`：表示「还不知道」，使用前必须先收窄

外部输入（`JSON.parse`、事件回调、`fetch` 返回值）应声明为 `unknown`，然后校验。这是把类型系统用在刀刃上的方式。

---

## 三、ES6+ 常用语法要点

### 3.1 `let` / `const` 与暂时性死区

```javascript
let x = 10
const y = 20
x = 15 // 允许
// y = 25 // TypeError: Assignment to constant variable
```

`const` 只保证**绑定**不变，对象内部仍可修改。另外 `let`/`const` 声明的变量在声明前访问会抛 `ReferenceError`（暂时性死区），与 `var` 得到 `undefined` 的行为不同。

### 3.2 箭头函数与 `this`

```javascript
const add = (a, b) => a + b
```

关键差异：箭头函数**没有自己的 `this`**，取的是定义时外层的 `this`。所以：

- 回调里想用外层 `this` → 用箭头函数
- 需要动态 `this`（对象方法、Vue 选项式 API 的 methods）→ 用 `function`

箭头函数也不能用 `new` 调用，且没有 `arguments`。

### 3.3 模板字符串与解构

```javascript
const name = 'John'
console.log(`Hello, ${name}!`)

let [a, b] = [1, 2]
let { name: userName, age = 18 } = { name: 'John' }  // 可重命名、可设默认值
```

解构常用于函数参数，配合默认值能省掉一堆判空：

```javascript
function connect({ host = '127.0.0.1', port = 6379 } = {}) { /* ... */ }
```

### 3.4 展开与剩余

```javascript
let arr2 = [1, ...[2, 3], 4]                 // [1, 2, 3, 4]
let { id, ...rest } = { id: 1, a: 2, b: 3 }  // rest = { a: 2, b: 3 }
```

注意：对象展开是**浅拷贝**，嵌套对象仍是同一引用。

### 3.5 class 与继承

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

`class` 是原型继承的语法糖，但行为有差异：类内部默认严格模式、方法不可枚举、必须用 `new` 调用。

### 3.6 Promise 与 async/await

```javascript
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run() {
  await sleep(1000)
  console.log('done')
}
```

`async` 函数总是返回 Promise；`await` 只暂停当前函数，不阻塞线程。并发场景用 `Promise.all`，别写成串行 `await`——这是最常见的性能问题。

### 3.7 模块

```javascript
// math.js
export function add(x, y) {
  return x + y
}

// main.js
import { add } from './math.js'
```

ESM 是静态解析的，`import` 必须写在顶层，打包工具据此做 tree-shaking。与 CommonJS 混用时注意 `__dirname`、`require` 在 ESM 里不存在。

---

## 四、容易出问题的地方

1. **`any` 传染**：一个 `any` 变量参与运算，结果也是 `any`，类型检查一路失效。宁可用 `unknown` 加校验。
2. **`as` 断言滥用**：`as` 不做运行时检查，写错了编译照样通过，只在运行时炸。尽量靠收窄而不是断言。
3. **`enum` 的产物**：普通 `enum` 会生成运行时对象（体积 + 非预期行为），绝大多数场景用字面量联合替代。
4. **可选属性 vs `undefined`**：`{ a?: string }` 与 `{ a: string | undefined }` 在 `exactOptionalPropertyTypes` 下语义不同，前者表示「可以没有这个键」。
5. **数组 `for...in`**：会遍历原型链上的键，数组一律用 `for...of` 或 `forEach`。

## 参考

- [TypeScript 官方手册：Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [tsconfig 全部选项说明](https://www.typescriptlang.org/tsconfig)
- [ECMAScript 2015 规范](https://262.ecma-international.org/6.0/)
