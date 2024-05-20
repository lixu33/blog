---
isTimeLine: true
title: Next.js 入门总结
date: 2024-05-13
tags:
 - 前端
categories:
 - 前端
keywords: Nextjs
---

# Next.js Dashboard 入门总结

回顾如何使用 Next.js 构建一个简单的 Dashboard 应用。我们将使用 Next.js 14 版本，并结合 Tailwind CSS 进行样式设计。

## 1. 项目初始化

使用以下命令创建一个新的 Next.js 项目：

```bash
npx create-next-app@latest nextjs-dashboard --use-npm 
--example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

## 2. 目录结构

创建后的项目目录结构如下：

```
├── app
│   ├── lib
│   └── ui
├── public
├── scripts
└── next.config.js
```

1. `app` 目录：存放 Next.js 应用程序中的路由和页面组件。
2. `lib` 目录：存放 Next.js 应用程序中的共享代码，例如工具函数、自定义 Hooks 等。
3. `ui` 目录：存放 Next.js 应用程序中的 UI 组件，例如按钮、表单、卡片等。
4. `public` 目录：存放 Next.js 应用程序中的静态资源，例如图片、字体等。
5. `scripts` 目录：存放 Next.js 应用程序中的脚本，例如构建脚本、部署脚本等。
6. `next.config.js` 文件：Next.js 的配置文件，用于配置项目的各种选项。

## 3. 路由

Next.js 使用文件系统路由，其中文件夹用于创建嵌套路由。每个文件夹代表一个映射到 URL 段的路由段。支持 `[]` 通配、`()` 分组、`[...]` 多级路由。

使用 `layout.tsx` 和 `page.tsx` 文件为每个路由创建单独的 UI。

* `page.tsx` 是一个特殊的 Next.js 文件，用于导出 React 组件，路由需要它才能访问。
* `layout.tsx` 用于定义页面的布局，例如页眉、页脚、侧边栏等。

## 4. CSS 样式 - Tailwind CSS

### 4.1 管理配置 Tailwind CSS

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 4.2 引入 Tailwind CSS

```javascript
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

### 4.3 使用 Tailwind CSS

```javascript
<h1 className="text-blue-500">I'm blue!</h1>
```

## 5. 字体和图片

### 5.1 字体

```typescript
import { Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'] });
```

```javascript
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

### 5.2 图片

```javascript
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

## 6. 页面导航

```javascript
import Link from 'next/link';

export default function NavLinks() {
  return (
    <>
      {/* 假设你有一个名为 links 的数组，包含链接信息 */}
      {links.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3"
          >
            {/* 假设你有一个 LinkIcon 组件 */}
            <LinkIcon className="w-6" />
            <p className="hidden md:block">{link.name}</p>
          </Link>
        ))}
    </>
  );
}
```

在 Next.js 中，使用 `<Link />` 组件在应用程序中的页面之间进行链接。`<Link />` 允许您使用 JavaScript 进行客户端导航。

## 7. 流式传输

在 Next.js 中，有两种实现流式传输的方式：

* 在页面级别，使用 `loading.tsx` 文件。
* 对于特定组件，使用 `<Suspense>`。

#### `loading.tsx` 示例

```javascript
export default function Loading() {
  return <div>Loading...</div>;
}
```

#### `<Suspense>` 示例

```javascript
<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

## 8. 搜索和分页

* `<Search />` 允许用户搜索。
* `<Pagination />` 允许用户在页面之间导航。

#### 搜索和分页示例

```javascript
import Pagination from '@/app/ui/invoices/pagination';
import Search from '@/app/ui/search';
import Table from '@/app/ui/invoices/table';
import { CreateInvoice } from '@/app/ui/invoices/buttons';
import { lusitana } from '@/app/ui/fonts';
import { InvoicesTableSkeleton } from '@/app/ui/skeletons';
import { Suspense } from 'react';

export default async function Page() {
  // ... 获取数据逻辑 ...

  return (
    <div className="w-full">
      <div className="flex w-full items-center justify-between">
        <h1 className={`${lusitana.className} text-2xl`}>Invoices</h1>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search invoices..." />
        <CreateInvoice />
      </div>
      <Suspense key={query + currentPage} fallback={<InvoicesTableSkeleton />}>
        <Table query={query} currentPage={currentPage} />
      </Suspense>
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
```

## 9. 错误处理

`error.tsx` 文件可用于为路由段定义 UI 边界。它用作意外错误的综合处理并允许您向用户显示备用 UI。

### 9.1 通用错误

```javascript
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

### 9.2 404 错误

```javascript
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

## 10. 添加元数据

```javascript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  // ...其他元数据
};
```

## 11. 数据获取

Next.js 提供了两种方式从外部获取数据：

* **`getStaticProps`**: 用于在构建时获取数据，适用于静态内容。
* **`getServerSideProps`**: 用于在每次请求时获取数据，适用于动态内容。

## 12. API 路由

Next.js 支持创建 API 路由，用于处理 API 请求。API 路由文件位于 `pages/api` 目录下。

## 13. 总结

Next.js 是一个功能强大的 React 框架，它提供了许多内置功能，例如路由、数据获取、API 路由等，可以帮助你快速构建现代化的 Web 应用。

## 14. 参考

* [Next.js 官方文档](https://nextjs.org/docs)
* [Tailwind CSS 官方文档](https://tailwindcss.com/docs/installation) 

