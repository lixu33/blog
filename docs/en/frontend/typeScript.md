---
isTimeLine: true
title: TypeScript and ES6 syntax
description: TypeScript and ES6 syntax.
date: 2024-05-23
tags:
- TypeScript
- ES6
- Frontend
categories:
- Frontend Technology
- Frontend
- Front-end
head:
- - meta
  - name: keywords
    content: TypeScript Syntax,ES6 syntax
translatedFrom: a08a4674dbc9912a
---
# TypeScript and ES6 Syntax

## 1. TypeScript Syntax Overview

**What Is TypeScript**
TypeScript is an open-source programming language developed by Microsoft. It is a superset of JavaScript that adds static typing and other features, making it easier to develop large-scale applications.

**Key Features of TypeScript**
- **Type System**: TypeScript provides static type checking, which can catch potential errors at the compilation stage.
- **Interfaces**: Interfaces define the structure of objects and can be used for type checking.
- **Classes and Inheritance**: TypeScript supports object-oriented programming, including classes, inheritance, access modifiers, and more.
- **Modularity**: TypeScript supports the ES6 module system, allowing code to be split into independent modules and improving maintainability.

## 2. TypeScript Syntax Examples

**Type Annotations**

```typescript
let isDone: boolean = false;
let decimal: number = 6;
let color: string = "blue";
let list: number[] = [1, 2, 3];
```

**Interface Definition**

```typescript
interface Person {
    firstName: string;
    lastName: string;
}

function greeter(person: Person) {
    return "Hello, " + person.firstName + " " + person.lastName;
}

let user = { firstName: "John", lastName: "Doe" };
console.log(greeter(user));
```

**Class Implementation**

```typescript
class Animal {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    public move(distanceInMeters: number) {
        console.log(`${this.name} moved ${distanceInMeters}m.`);
    }
}

let dog = new Animal("Dog");
dog.move(10);
```

**Module Import and Export**

```typescript
// math.ts
export function add(x: number, y: number): number {
    return x + y;
}

// main.ts
import { add } from './math';
console.log(add(2, 3));
```

## 3. Overview of Important ES6 Syntax

**What Is ES6**
ES6 (ECMAScript 2015) is the sixth edition of the JavaScript standard. It introduces many new features that make JavaScript programming more efficient and convenient.

**Key Features of ES6**
- **let and const**: Used to declare variables. let has block-level scope, and const is used to declare constants.
- **Arrow Functions**: Simplify function definitions and do not bind `this`.
- **Template Strings**: Allow multi-line strings and embedded expressions.
- **Destructuring Assignment**: Extract values from arrays or objects and assign them to variables.
- **Spread Operator**: Used to expand arrays or objects.
- **Classes and Inheritance**: Provide syntactic sugar for object-oriented programming.
- **Modularity**: Provide syntax for importing and exporting modules.
- **Promise**: Used to handle asynchronous operations.
- **async/await**: Handle asynchronous operations more concisely.

## 4. ES6 Syntax Examples

**Using let and const**

```javascript
let x = 10;
const y = 20;
x = 15; // 允许
y = 25; // 报错，y 是常量
```

**Arrow Function Example**

```javascript
const add = (a, b) => a + b;
console.log(add(2, 3));
```

**Template String Example**

```javascript
let name = "John";
let greeting = `Hello, ${name}!`;
console.log(greeting);
```

**Destructuring Assignment Example**

```javascript
let [a, b] = [1, 2];
let { name, age } = { name: "John", age: 25 };
```

**Spread Operator Example**

```javascript
let arr1 = [1, 2];
let arr2 = [...arr1, 3, 4]; // [1, 2, 3, 4]
```

**Class and Inheritance Example**

```javascript
class Animal {
    constructor(name) {
        this.name = name;
    }

    move(distanceInMeters) {
        console.log(`${this.name} moved ${distanceInMeters}m.`);
    }
}

class Dog extends Animal {
    bark() {
        console.log('Woof! Woof!');
    }
}

let dog = new Dog('Dog');
dog.bark();
dog.move(10);
```

**Module Import and Export Example**

```javascript
// math.js
export function add(x, y) {
    return x + y;
}

// main.js
import { add } from './math';
console.log(add(2, 3));
```

**Using Promise and async/await**

```javascript
// Promise 示例
let promise = new Promise((resolve, reject) => {
    setTimeout(() => resolve("done!"), 1000);
});

promise.then(result => console.log(result));

// async/await 示例
async function asyncFunction() {
    let result = await promise;
    console.log(result);
}

asyncFunction();
```
