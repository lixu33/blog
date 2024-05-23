---
isTimeLine: true
title: Next.js - 从零开始构建全栈应用
description: 这是一篇针对初学者的 Next.js 入门指南，带你从零开始构建一个完整的全栈应用，涵盖路由、数据获取、样式设计、API 路由等核心概念。
date: 2024-05-13
tags:
 - Next.js
 - React
 - 前端
 - 全栈
categories:
 - 前端
head:
  - - meta
    - name: keywords
      content: Next.js, 入门, 教程, 全栈, React, 框架
---

# Next.js Dashboard 入门

本文将总结如何使用 Next.js 构建一个简单的 Dashboard 应用。我们将使用 Next.js 14 版本，并结合 Tailwind CSS 进行样式设计，创建一个美观且功能完善的管理后台界面。

## 1. 项目初始化

首先，使用以下命令创建一个新的 Next.js 项目。我们使用了 `create-next-app` 命令，并指定了官方提供的 Dashboard 示例模板，以便快速搭建项目基础结构：

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

详细说明：

- `app` 目录：存放 Next.js 应用程序中的核心逻辑和组件。
    - `lib` 目录：存放共享代码，如工具函数、自定义 Hooks 等，方便代码复用。
    - `ui` 目录：存放 UI 组件，如按钮、表单、卡片等，用于构建用户界面。
- `public` 目录：存放静态资源，如图片、字体等，可以直接在代码中引用。
- `scripts` 目录：存放脚本，如构建脚本、部署脚本等，用于自动化项目构建和部署流程。
- `next.config.js` 文件：Next.js 的配置文件，用于配置项目的各种选项，如路由、构建、环境变量等。

## 3. 路由

Next.js 使用文件系统路由，通过文件夹和文件名的约定来定义路由规则，清晰易懂。每个文件夹代表一个映射到 URL 段的路由段，例如 `/dashboard`、`/settings` 等。

使用 `layout.tsx` 和 `page.tsx` 文件为每个路由创建单独的 UI 布局和内容：

- `page.tsx` 是一个特殊的 Next.js 文件，用于导出 React 组件，路由需要它才能访问。它定义了该路由对应页面的主要内容和逻辑。
- `layout.tsx` 用于定义页面的布局，例如页眉、页脚、侧边栏等，包裹在 `page.tsx` 外层，提供页面结构。

Next.js 还支持动态路由、嵌套路由等高级路由功能，可以满足各种复杂的应用场景。

## 4. CSS 样式 - Tailwind CSS

我们使用 Tailwind CSS 来快速设计页面样式。Tailwind CSS 是一个 utility-first 的 CSS 框架，提供了大量的预定义 CSS 类，可以像搭积木一样组合使用，快速构建出各种样式。

在项目的配置文件中，我们已经配置好了 Tailwind CSS，并使用 `@tailwind` 指令引入了基础样式、组件样式和工具类：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

在项目的根布局组件 `app/layout.tsx` 中，我们引入了全局样式文件 `global.css`，该文件包含了 Tailwind CSS 的基本配置：

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

现在，我们可以在任何组件中使用 Tailwind CSS 提供的类名来设置样式，例如：

```javascript
<h1 className="text-blue-500">I'm blue!</h1>
```

## 5. 字体和图片

我们使用 `next/font` 来自动优化字体加载，并使用 Google Fonts 提供的 Inter 字体作为示例：

```typescript
import { Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'] });
```

然后，在根布局组件中应用该字体：

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

我们使用 `next/image` 组件来优化图片加载和显示，它可以根据设备分辨率和屏幕尺寸自动加载最佳尺寸的图片，并支持懒加载、占位符等功能。

```javascript
import Image from 'next/image';

export default function Page() {
  return (
    <div>
      <Image
        src="/hero-desktop.png"
        width={1000}
        height={760}
        alt="Screenshots of the dashboard project showing desktop version"
      />
    </div>
  );
}
```

## 6. 页面导航

在 Next.js 中，我们使用 `<Link />` 组件在应用程序中的页面之间进行链接。`<Link />` 组件可以预加载目标页面的资源，提供更快的页面跳转体验。

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

## 7. 流式传输

流式传输可以将页面内容分块加载，提高页面加载速度和用户体验。在 Next.js 中，有两种实现流式传输的方式：

- 在页面级别，使用 `loading.tsx` 文件定义加载状态的 UI，Next.js 会在页面加载过程中显示该 UI。
- 对于特定组件，使用 `<Suspense>` 组件包裹需要异步加载的组件，并使用 `fallback` 属性指定加载状态的 UI。

`loading.tsx` 示例

```javascript
export default function Loading() {
  return <div>Loading...</div>;
}
```

`<Suspense>` 示例

```javascript
<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

## 8. 搜索和分页

搜索和分页是 Dashboard 应用中常见的交互功能，Next.js 提供了灵活的 API 和组件来实现这些功能。

- `<Search />` 组件允许用户输入关键词进行搜索，并可以通过事件监听获取用户输入。
- `<Pagination />` 组件用于展示分页导航，允许用户浏览不同页面的数据。

示例

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

错误处理对于提高应用的健壮性和用户体验至关重要。Next.js 提供了两种错误处理机制：

- `error.tsx` 文件：用于定义路由段的 UI 边界，可以捕获路由组件中抛出的错误，并向用户显示友好的错误信息。
- `ErrorBoundary` 组件：用于捕获 React 组件树中抛出的错误，可以防止整个应用崩溃，并向用户显示友好的错误信息。

`error.tsx` 示例

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

404 示例

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

元数据对于 SEO 非常重要，可以帮助搜索引擎理解页面内容，提高页面排名。在 Next.js 中，可以使用 `metadata` 对象来定义页面的元数据，例如标题、描述、关键词等。

```javascript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  description: 'Manage your invoices and track your payments with Acme Dashboard.',
  keywords: 'acme, dashboard, invoices, payments, billing',
};
```

## 11. 数据获取

Next.js 提供了两种方式从外部获取数据，以满足不同的应用场景：

- **`getStaticProps`**: 用于在构建时获取数据，适用于静态内容。构建时数据获取可以提高页面加载速度，有利于 SEO，因为搜索引擎爬虫可以更快地抓取页面内容。

示例：

```javascript
// pages/posts/[id].js
export async function getStaticProps({ params }) {
  const res = await fetch(`https://.../posts/${params.id}`);
  const post = await res.json();

  return { 
    props: { post } 
  };
}
```

- **`getServerSideProps`**: 用于在每次请求时获取数据，适用于动态内容。服务端渲染可以确保用户始终看到最新的数据，例如用户特定的信息或实时更新的内容。

示例：

```javascript
// pages/dashboard.js
export async function getServerSideProps(context) {
  const user = await getUser(context.req.headers.cookie); // 获取用户信息

  return {
    props: { user },
  };
}
```

## 12. API 路由

Next.js 支持创建 API 路由，用于处理 API 请求，例如获取数据、提交表单、身份验证等。API 路由文件位于 `pages/api` 目录下，每个文件对应一个 API 端点。

示例：

```javascript
// pages/api/login.js
export default async function handler(req, res) {
  // 处理登录请求
  const { username, password } = req.body;

  if (username === 'admin' && password === 'password') {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
```

## 13. 总结

Next.js 是一个功能强大的 React 框架，它提供了许多内置功能和 API，例如路由、数据获取、API 路由、错误处理、SEO 优化等，可以帮助我们快速构建现代化的 Web 应用。

## 14. 参考

- [Next.js 官方文档](https://nextjs.org/docs)
- [Tailwind CSS 官方文档](https://tailwindcss.com/docs/installation)