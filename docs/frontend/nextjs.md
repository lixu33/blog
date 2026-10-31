---
isTimeLine: true
sticky: 1
title: Next.js 全栈应用入门
description: 用 App Router 搭一个 Dashboard：目录约定、布局嵌套、Tailwind v4 接入、Server Component 的数据获取与缓存、Route Handler 写接口，以及 error、not-found、loading 三类边界文件。
date: 2024-05-13
updated: 2026-10-31
author: 烟霞不系舟
lang: zh-CN
categories:
- 前端技术
- Frontend
tags:
- Next.js
- React
- 前端
- 全栈
head:
- - meta
  - name: keywords
    content: Next.js, App Router, Server Component, Route Handler, Tailwind CSS v4, 数据获取, 缓存
- - meta
  - property: og:type
    content: article
- - meta
  - property: og:title
    content: Next.js - 从零开始构建全栈应用
- - meta
  - property: og:description
    content: 用 App Router 搭一个 Dashboard：目录约定、布局嵌套、Tailwind v4、Server Component 数据获取、Route Handler 与三类边界文件。
---

# Next.js 全栈应用入门

照抄旧教程的 `getServerSideProps` 到 `app/` 目录下会直接报错，`pages/api` 里的接口在 App Router 项目里也不会被加载——这是从 Pages Router 切过来最先撞上的两件事。

下面按一个 Dashboard 项目的搭建顺序走：初始化和目录约定、路由与布局、样式与资源、数据获取与缓存、写接口、错误边界，每节末尾标出与 Pages Router 写法的对应关系。

## 先分清两套路由

| 对比项 | App Router（`app/`） | Pages Router（`pages/`） |
|---|---|---|
| 页面文件 | `page.tsx` | `index.tsx` / `[id].tsx` |
| 布局 | `layout.tsx`，可嵌套 | `_app.tsx`，全局唯一 |
| 数据获取 | 组件内 `async` + `fetch` | `getStaticProps` / `getServerSideProps` |
| 接口 | `route.ts` 导出 `GET`/`POST` | `api/*.js` 导出默认 handler |

两套可以共存，但新项目只建 `app/`。`app/` 与 `pages/` 下同名路径同时存在会冲突，迁移完成后再删掉 `pages/`。

## 一、初始化

Next.js 16 要求 Node 20.9 及以上，先确认版本：

```bash
node -v
npx create-next-app@latest nextjs-dashboard --use-npm \
  --example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

注意命令是一行，换行要加反斜杠，直接折行会被 shell 拆成两条命令。

`create-next-app` 会问是否使用 TypeScript、Tailwind、`src/` 目录、App Router 和 Turbopack。这个 starter 已经预置了 TypeScript 和 App Router，交互时选默认即可。

## 二、目录结构

```
├── app
│   ├── dashboard
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib
│   ├── ui
│   └── layout.tsx
├── public
├── scripts
├── next.config.ts
└── postcss.config.mjs
```

- `app/`：路由段与组件。`lib/` 放数据查询和工具函数，`ui/` 放展示组件，这两个目录不加路由
- `public/`：静态资源，按根路径引用，`/hero.png` 对应 `public/hero.png`
- `scripts/`：数据初始化脚本，通过 `package.json` 的 `seed` 命令执行
- `next.config.ts`：配置文件。Next.js 15 起脚手架默认生成 TS 版本，`next.config.js` 仍然兼容

**只有 `page.tsx` 和 `route.ts` 会生成可访问的路由**，其余文件（组件、工具函数、`layout.tsx`）放在 `app/` 里不会暴露成 URL。

## 三、路由与布局

文件夹名即路径段，`app/dashboard/invoices/page.tsx` 映射到 `/dashboard/invoices`。`layout.tsx` 包裹同段及以下所有子路由，且**在导航时保持挂载、不重新渲染**，状态和滚动位置都能保留。

```tsx
// app/dashboard/layout.tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col md:flex-row">
      <div className="w-full flex-none md:w-64">
        <SideNav />
      </div>
      <div className="grow p-6 md:p-12">{children}</div>
    </div>
  );
}
```

几个约定：

- 根布局 `app/layout.tsx` 必须包含 `<html>` 和 `<body>`，且只能有一个
- 布局之间是嵌套关系，子布局渲染在父布局的 `children` 位置
- 加括号的目录 `(overview)` 是路由组，不影响 URL，只用来共享布局

### 3.1 动态段与 params

`app/dashboard/invoices/[id]/page.tsx` 匹配 `/dashboard/invoices/123`。**Next.js 15 起 `params` 和 `searchParams` 是 Promise，必须 `await`**，直接解构拿到的是 Promise 而不是值：

```tsx
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

捕获全部后续段用 `[...slug]`，可选段用 `[[...slug]]`。

## 四、样式：Tailwind CSS

脚手架现在装的是 Tailwind v4，**不再有 `@tailwind base/components/utilities` 三行指令**，也默认不生成 `tailwind.config.js`，改为在 CSS 里一行导入：

```css
/* app/ui/global.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(58% 0.2 255);
}
```

`postcss.config.mjs` 里挂 `@tailwindcss/postcss`，这就是全部接入工作。若沿用 v3 的写法（`@tailwind` 指令 + `content` 配置），在 v4 下样式不会生成。

根布局引入全局样式：

```tsx
import '@/app/ui/global.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

之后在组件里直接组合类名，`<h1 className="text-blue-500">` 即可。条件类名建议用 `clsx` 或模板字符串拼接，不要手写字符串相加。

## 五、字体与图片

`next/font` 在构建时下载字体文件并自托管，去掉对外部域名的请求，同时自动生成 `size-adjust` 减少布局偏移：

```tsx
// app/ui/fonts.ts
import { Inter, Lusitana } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'] });
export const lusitana = Lusitana({ weight: ['400', '700'], subsets: ['latin'] });
```

在根布局应用：

```tsx
import { inter } from '@/app/ui/fonts';

<body className={`${inter.className} antialiased`}>{children}</body>
```

中文字体通常体积过大，`next/font/google` 下载慢且子集不全，中文项目更实用的做法是用 `next/font/local` 指向 `public/fonts` 下的 `woff2` 文件。

`next/image` 提供尺寸优化、懒加载和格式转换：

```tsx
import Image from 'next/image';

<Image
  src="/hero-desktop.png"
  width={1000}
  height={760}
  alt="Dashboard 桌面版截图"
  className="hidden md:block"
/>
```

必须给 `width`/`height`（或用 `fill` 配合定位父元素），否则会报缺失尺寸。远程图片要在 `next.config.ts` 的 `images.remotePatterns` 里声明域名，未声明的域名会直接报错而不是静默降级。

## 六、导航与流式渲染

`<Link>` 在视口内会预取目标路由的代码和 RSC 负载，跳转时无需整页刷新：

```tsx
import Link from 'next/link';

{links.map((link) => (
  <Link key={link.name} href={link.href}>{link.name}</Link>
))}
```

高亮当前项要在客户端组件里用 `usePathname()` 比较，`Link` 本身不提供激活态样式。

### 6.1 分块加载

慢数据不应该阻塞整个页面。两种做法：

| 方式 | 适用 |
|---|---|
| `loading.tsx` | 整个路由段的首次加载骨架 |
| `<Suspense fallback>` | 页面内某个异步组件的局部骨架 |

```tsx
import { Suspense } from 'react';

<div className="grid gap-6 md:grid-cols-4">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

`<Suspense>` 的边界内组件独立流式输出，其余部分先到先渲染。`loading.tsx` 本质上是给整段包了一层 Suspense，两者可以叠加使用。

## 七、搜索与分页

App Router 里搜索和分页的状态放在 URL 上，用 `searchParams` 读取，服务端渲染结果，链接可直接分享：

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const { query = '', page = '1' } = await searchParams;
  const currentPage = Number(page);
  // 用 query 和 currentPage 查数据
}
```

- 输入框用 `useSearchParams()` + `useRouter().replace()` 更新 URL，加 300ms 防抖，避免每个按键都发一次请求
- 翻页链接里把 `page` 合并进 query 对象再传给 `href`，其余查询参数原样带过去
- 数据查询函数要复用，翻页和搜索走同一条路径，分页总数单独查一次 `COUNT`

`<Suspense key={query + currentPage}>` 里的 `key` 必须随查询条件变化，否则切换时会复用旧组件的状态。

## 八、数据获取

Server Component 直接写 `async`，在服务端执行，`fetch` 和数据库查询都不会进客户端包：

```tsx
export default async function Page() {
  const invoices = await sql`SELECT * FROM invoices LIMIT 10`;
  return <Table invoices={invoices} />;
}
```

### 8.1 缓存语义

Next.js 15 起 `fetch` **默认不缓存**，等价于 `cache: 'no-store'`（v14 及以前默认强缓存，这是升级后行为变化最大的一处）：

| 需求 | 写法 |
|---|---|
| 每次请求取新数据 | `fetch(url)` 或显式 `cache: 'no-store'` |
| 定时重新验证 | `fetch(url, { next: { revalidate: 60 } })` |
| 构建时取一次 | `export const dynamic = 'force-static'` |

写入后要让相关页面失效，调用 `revalidatePath('/dashboard/invoices')` 或 `revalidateTag('invoices')`，前者按路径，后者给 `fetch` 打 `next: { tags: ['invoices'] }` 后按标签批量失效。

### 8.2 与 Pages Router 的对应

| Pages Router | App Router |
|---|---|
| `getStaticProps` | 组件内 `fetch` + `revalidate` |
| `getServerSideProps` | 组件内 `fetch`，或用 `cookies()`/`headers()` 自动转为动态渲染 |
| `getStaticPaths` | `generateStaticParams()` |
| 客户端 `useEffect` 拉数据 | 优先改成服务端取，需要交互时再用 `useSWR`/`useQuery` |

`cookies()`、`headers()` 在 Next.js 15 起同样是异步的，需要 `await`。调用它们会让所在路由退出静态渲染，这是把整个页面变成动态的常见意外原因。

### 8.3 表单与写入

增删改用 Server Actions：`'use server'` 标记的函数可以直接作为 `<form action={...}>` 的处理器，在服务端执行并在完成后触发 `revalidatePath`。它取代了「建一个 API 路由 + 客户端 `fetch`」的样板代码，但只适用于同源表单提交，外部调用方仍要走 Route Handler。

## 九、Route Handler

接口放在 `app/api/<path>/route.ts`，按 HTTP 方法导出同名函数：

```ts
// app/api/login/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (username === 'admin' && password === 'secret') {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
```

与 `pages/api` 的差异：

- 文件必须叫 `route.ts`，导出的是具名函数而非默认 handler，参数只有 `request`，响应通过返回值而非 `res.status().json()`
- 默认不缓存，`GET` 需要缓存时加 `export const dynamic = 'force-static'`
- 路由段可以嵌套，`app/api/invoices/[id]/route.ts` 里 `await params` 拿 id

## 十、错误与 404

| 文件 | 作用范围 |
|---|---|
| `error.tsx` | 当前段及子段，必须 `'use client'` |
| `global-error.tsx` | 根布局自身的错误，需自带 `<html>`/`<body>` |
| `not-found.tsx` | `notFound()` 触发或路径不匹配 |

```tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <h2>出错了</h2>
      <button onClick={() => reset()}>重试</button>
    </main>
  );
}
```

`error.tsx` 只能捕获其**子段**渲染时抛出的错误，同级的 `layout.tsx` 出错要靠上一层或 `global-error.tsx`。`digest` 是服务端错误的哈希，生产环境不会把堆栈发给客户端，排查要拿这个值去对服务端日志。数据不存在时用 `notFound()` 主动跳 404，比返回空列表更清晰。

## 十一、元数据

静态元数据导出 `metadata` 对象，`keywords` 是**字符串数组**而非逗号分隔的字符串：

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  description: '管理发票与收款状态。',
  keywords: ['acme', 'dashboard', 'invoices'],
};
```

需要按数据动态生成时改用 `generateMetadata`，它和页面一样可以是 `async`：

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  return { title: `${invoice.name} | Invoices` };
}
```

`metadata` 与 `generateMetadata` 在同一个文件里只能二选一。子段未声明时会继承父段的字段，`title` 可以写成 `{ template: '%s | Acme', default: 'Acme' }` 统一加后缀。

## 参考

- [Next.js 官方文档：App Router](https://nextjs.org/docs/app)
- [Next.js 数据获取与缓存](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Tailwind CSS v4 升级指南](https://tailwindcss.com/docs/upgrade-guide)
