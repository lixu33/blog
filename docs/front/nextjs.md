---
isTimeLine: true
title: Nextjs入门
date: 2024-05-13
tags:
 - 前端
categories:
 - 前端
keywords: Nextjs
---

# Nextjs Dashboard

## 初始化项目

```js
npx create-next-app@latest nextjs-dashboard --use-npm 
--example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

## 目录结构

```
├─ app
│  ├─ lib
│  ├─ ui
├─ public
├─ scripts 
├─ next.config.js
```

1. app 目录下存放的是 Next.js 应用程序中的路由和页面。
2. lib 目录存放的是 Next.js 应用程序中的共享代码。
3. ui 目录存放的是 Next.js 应用程序中的 UI 组件。
4. public 目录存放的是 Next.js 应用程序中的静态资源。
5. scripts 目录存放的是 Next.js 应用程序中的脚本。

### 路由

Next.js 使用文件系统路由，其中文件夹用于创建嵌套路由。每个文件夹代表一个映射到URL段的路由段。支持[]通配，()分组，[...]多级路由。

使用 layout.tsx 和 page.tsx 文件为每个路由创建单独的 UI。

page.tsx 是一个特殊的 Next.js 文件，用于导出 React 组件，路由需要它才能访问。

## CSS 样式 Tailwind CSS

global.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

layout.tsx
```js
import '@/app/ui/global.css';
 
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

page.tsx
```js
<h1 className="text-blue-500">I'm blue!</h1>
```

## 字体和图片

### 字体

front.ts
```js
import { Inter } from 'next/font/google';
 
export const inter = Inter({ subsets: ['latin'] });
```
layout.tsx
```js
import '@/app/ui/global.css';
import { inter } from '@/app/ui/fonts';
 
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
```

### 图片

page.tsx
```js
import AcmeLogo from '@/app/ui/acme-logo';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { lusitana } from '@/app/ui/fonts';
import Image from 'next/image';
 
export default function Page() {
  return (
    <div className="flex items-center justify-center p-6 md:w-3/5 md:px-28 md:py-12">
      <Image
        src="/hero-desktop.png"
        width={1000}
        height={760}
        className="hidden md:block"
        alt="Screenshots of the dashboard project showing desktop version"
      />
    </div>
  );
}
```

## 页面导航

link.tsx
```js
import Link from 'next/link';

export default function NavLinks() {
  return (
    <>
      return (
          <Link
            key={link.name}
            href={link.href}
            className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3"
          >
            <LinkIcon className="w-6" />
            <p className="hidden md:block">{link.name}</p>
          </Link>
        );
    </>
  );
}
```

在 Next.js 中，使用 \<Link\/\> 组件在应用程序中的页面之间进行链接。\<Link\/\> 允许您使用JavaScript进行客户端导航。

## 流式传输

在 Next.js 中，有两种实现流式传输的方式：
* 在页面级别，使用 loading.tsx 文件。
* 对于特定组件，使用 \<Suspense\>。

loading.tsx
```js
export default function Loading() {
  return <div>Loading...</div>;
}
```
Suspense
```js
 <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
        <Suspense fallback={<RevenueChartSkeleton />}>
          <RevenueChart />
        </Suspense>
        <LatestInvoices latestInvoices={latestInvoices} />
      </div>
```

## 搜索和分页

* \<Search\/\> 允许用户搜索。
* \<Pagination\/\> 允许用户在页面之间导航。

invoices/page.tsx
```js
import Pagination from '@/app/ui/invoices/pagination';
import Search from '@/app/ui/search';
import Table from '@/app/ui/invoices/table';
import { CreateInvoice } from '@/app/ui/invoices/buttons';
import { lusitana } from '@/app/ui/fonts';
import { InvoicesTableSkeleton } from '@/app/ui/skeletons';
import { Suspense } from 'react';
 
export default async function Page() {
  return (
    <div className="w-full">
      <div className="flex w-full items-center justify-between">
        <h1 className={`${lusitana.className} text-2xl`}>Invoices</h1>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search invoices..." />
        <CreateInvoice />
      </div>
      {/*  <Suspense key={query + currentPage} fallback={<InvoicesTableSkeleton />}>
        <Table query={query} currentPage={currentPage} />
      </Suspense> */}
      <div className="mt-5 flex w-full justify-center">
        {/* <Pagination totalPages={totalPages} /> */}
      </div>
    </div>
  );
}
```

## 错误处理

error.tsx 文件可用于为路由段定义 UI 边界。它用作意外错误的综合处理并允许您向用户显示备用 UI。

```js
'use client';
 
import { useEffect } from 'react';
 
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);
 
  return (
    <main className="flex h-full flex-col items-center justify-center">
      <h2 className="text-center">Something went wrong!</h2>
      <button
        className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400"
        onClick={
          // Attempt to recover by trying to re-render the invoices route
          () => reset()
        }
      >
        Try again
      </button>
    </main>
  );
}
```

### 404错误

not-found.tsx
```js
import Link from 'next/link';
import { FaceFrownIcon } from '@heroicons/react/24/outline';
 
export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2">
      <FaceFrownIcon className="w-10 text-gray-400" />
      <h2 className="text-xl font-semibold">404 Not Found</h2>
      <p>Could not find the requested invoice.</p>
      <Link
        href="/dashboard/invoices"
        className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400"
      >
        Go Back
      </Link>
    </main>
  );
}
```

## 添加元数据

```js
import { Metadata } from 'next';
 
export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  ...
};
```







