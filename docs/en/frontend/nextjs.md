---
isTimeLine: true
sticky: 1
title: Getting Started with Full-Stack Next.js Apps
description: A beginner-friendly Next.js guide that walks you through building a complete full-stack app from scratch, covering core concepts like routing, data fetching, styling, and API routes.
date: 2024-05-13
author: 烟霞不系舟
lang: zh-CN
categories:
- Frontend Technology
- Frontend
tags:
- Next.js
- React
- Frontend
- Full-stack
head:
- - meta
  - name: keywords
    content: Next.js,Getting Started,Tutorial,Full-stack,React,Framework
- - meta
  - property: og:type
    content: article
- - meta
  - property: og:title
    content: Next.js - Build a Full-Stack App from Scratch
- - meta
  - property: og:description
    content: A beginner's guide to Next.js that walks you through building a complete full-stack app from scratch, covering core concepts such as routing, data fetching, styling, and API routes.
translatedFrom: 9285780a742e9e6d
---
# Getting Started with the Next.js Dashboard

This article summarizes how to build a simple Dashboard application using Next.js. We will use Next.js 16 (the current stable version), combined with Tailwind CSS for styling, to create a beautiful and fully featured admin dashboard interface.

## 1. Project Initialization

First, create a new Next.js project using the following command. We use the `create-next-app` command and specify the official Dashboard example template to quickly set up the project foundation:

```bash
npx create-next-app@latest nextjs-dashboard --use-npm 
--example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

## 2. Directory Structure

The project directory structure after creation is as follows:

```
├── app
│   ├── lib
│   └── ui
├── public
├── scripts
└── next.config.js
```

Detailed description:

- `app` directory: stores the core logic and components in the Next.js application.
    - `lib` directory: stores shared code, such as utility functions, custom Hooks, etc., for code reuse.
    - `ui` directory: stores UI components, such as buttons, forms, cards, etc., used to build the user interface.
- `public` directory: stores static assets, such as images, fonts, etc., which can be referenced directly in code.
- `scripts` directory: stores scripts, such as build scripts, deployment scripts, etc., used to automate the project build and deployment process.
- `next.config.js` file: the Next.js configuration file, used to configure various project options, such as routing, build, environment variables, etc.

## 3. Routing

Next.js uses file-system routing, defining routing rules through folder and filename conventions, which is clear and easy to understand. Each folder represents a route segment mapped to a URL segment, such as `/dashboard`, `/settings`, etc.

Use `layout.tsx` and `page.tsx` files to create separate UI layouts and content for each route:

- `page.tsx` is a special Next.js file used to export React components; a route needs it to be accessible. It defines the main content and logic of the page corresponding to the route.
- `layout.tsx` is used to define the page layout, such as the header, footer, sidebar, etc., wrapping outside `page.tsx` to provide page structure.

Next.js also supports advanced routing features such as dynamic routes and nested routes, which can meet various complex application scenarios.

## 4. CSS Styling - Tailwind CSS

We use Tailwind CSS to quickly design page styles. Tailwind CSS is a utility-first CSS framework that provides a large number of predefined CSS classes that can be combined like building blocks to quickly build various styles.

In the project configuration file, we have already configured Tailwind CSS and used the `@tailwind` directives to import base styles, component styles, and utility classes:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

In the root layout component `app/layout.tsx`, we import the global stylesheet `global.css`, which contains the basic Tailwind CSS configuration:

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

Now, we can use the class names provided by Tailwind CSS in any component to set styles, for example:

```javascript
<h1 className="text-blue-500">I'm blue!</h1>
```

## 5. Fonts and Images

We use `next/font` to automatically optimize font loading and use the Inter font provided by Google Fonts as an example:

```typescript
import { Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'] });
```

Then, apply the font in the root layout component:

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

We use the `next/image` component to optimize image loading and display. It can automatically load images at the optimal size based on device resolution and screen size, and supports lazy loading, placeholders, etc.

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

## 6. Page Navigation

In Next.js, we use the `<Link />` component to link between pages in the application. The `<Link />` component can prefetch resources of the target page, providing a faster page transition experience.

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

## 7. Streaming

Streaming can load page content in chunks, improving page load speed and user experience. In Next.js, there are two ways to implement streaming:

- At the page level, use the `loading.tsx` file to define the UI for the loading state; Next.js will display this UI during page loading.
- For specific components, wrap components that need asynchronous loading with the `<Suspense>` component, and use the `fallback` prop to specify the UI for the loading state.

`loading.tsx` example

```javascript
export default function Loading() {
  return <div>Loading...</div>;
}
```

`<Suspense>` example

```javascript
<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

## 8. Search and Pagination

Search and pagination are common interactive features in Dashboard applications. Next.js provides flexible APIs and components to implement these features.

- The `<Search />` component allows users to enter keywords for search, and can get user input through event listeners.
- The `<Pagination />` component is used to display pagination navigation, allowing users to browse data on different pages.

Example

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

## 9. Error Handling

Error handling is crucial for improving application robustness and user experience. Next.js provides two error handling mechanisms:

- `error.tsx` file: used to define a UI boundary for a route segment, can catch errors thrown in route components and display friendly error messages to users.
- `ErrorBoundary` component: used to catch errors thrown in the React component tree, can prevent the entire application from crashing and display friendly error messages to users.

`error.tsx` example

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

404 example

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

## 10. Adding Metadata

Metadata is very important for SEO and can help search engines understand page content and improve page ranking. In Next.js, you can use the `metadata` object to define page metadata, such as title, description, keywords, etc.

```javascript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  description: 'Manage your invoices and track your payments with Acme Dashboard.',
  keywords: 'acme, dashboard, invoices, payments, billing',
};
```

## 11. Data Fetching

Next.js provides two ways to fetch data from external sources to meet different application scenarios:

- **`getStaticProps`**: used to fetch data at build time, suitable for static content. Build-time data fetching can improve page load speed and benefit SEO, because search engine crawlers can crawl page content faster.

Example:

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

- **`getServerSideProps`**: used to fetch data on every request, suitable for dynamic content. Server-side rendering can ensure users always see the latest data, such as user-specific information or real-time updated content.

Example:

```javascript
// pages/dashboard.js
export async function getServerSideProps(context) {
  const user = await getUser(context.req.headers.cookie); // 获取用户信息

  return {
    props: { user },
  };
}
```

## 12. API Routes

Next.js supports creating API routes to handle API requests, such as fetching data, submitting forms, authentication, etc. API route files are located in the `pages/api` directory, with each file corresponding to an API endpoint.

Example:

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

## 13. Summary

Next.js is a powerful React framework that provides many built-in features and APIs, such as routing, data fetching, API routes, error handling, SEO optimization, etc., helping us quickly build modern web applications.

## 14. References

- [Next.js official documentation](https://nextjs.org/docs)
- [Tailwind CSS official documentation](https://tailwindcss.com/docs/installation)