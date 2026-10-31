---
isTimeLine: true
sticky: 1
title: Getting Started with Full-Stack Next.js Apps
description: "Build a Dashboard with App Router: directory conventions, nested layouts, Tailwind v4 integration, Server Component data fetching and caching, Route Handlers for APIs, and the three boundary files: error, not-found, and loading."
date: 2024-05-13
updated: 2026-10-31
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
    content: Next.js,App Router,Server Component,Route Handler,Tailwind CSS v4,Data Fetching,Cache
- - meta
  - property: og:type
    content: article
- - meta
  - property: og:title
    content: Building a Full-Stack App from Scratch with Next.js
- - meta
  - property: og:description
    content: "Build a Dashboard with App Router: directory conventions, nested layouts, Tailwind v4, Server Component data fetching, Route Handlers, and three types of boundary files."
translatedFrom: a06419ae254da55f
---
# Getting Started with Full-Stack Next.js Apps

Copying `getServerSideProps` from old tutorials directly into the `app/` directory will throw an error, and API routes in `pages/api` will not be loaded in an App Router project—these are the first two issues you will hit when switching from the Pages Router.

Below, we will follow the setup order for a Dashboard project: initialization and directory conventions, routing and layouts, styling and assets, data fetching and caching, writing APIs, and error boundaries. At the end of each section, we will note how it maps to the Pages Router approach.

## First, distinguish the two routers

| Comparison | App Router (`app/`) | Pages Router (`pages/`) |
|---|---|---|
| Page files | `page.tsx` | `index.tsx` / `[id].tsx` |
| Layout | `layout.tsx`, nestable | `_app.tsx`, globally unique |
| Data fetching | `async` + `fetch` in component | `getStaticProps` / `getServerSideProps` |
| API | `route.ts` exports `GET`/`POST` | `api/*.js` exports default handler |

The two can coexist, but new projects should only create `app/`. If the same-named path exists under both `app/` and `pages/`, they conflict; delete `pages/` after migration is complete.

## 1. Initialization

Next.js 16 requires Node 20.9 or later. Confirm the version first:

```bash
node -v
npx create-next-app@latest nextjs-dashboard --use-npm \
  --example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

Note that the command is one line; add backslashes for line breaks. Directly wrapping the line will cause the shell to split it into two commands.

`create-next-app` will ask whether to use TypeScript, Tailwind, the `src/` directory, App Router, and Turbopack. This starter already has TypeScript and App Router preset; choose the defaults during the prompts.

## 2. Directory Structure

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

- `app/`: route segments and components. `lib/` holds data queries and utility functions, and `ui/` holds presentational components; these two directories do not add routes
- `public/`: static assets, referenced by root path; `/hero.png` corresponds to `public/hero.png`
- `scripts/`: data initialization scripts, run via the `seed` command in `package.json`
- `next.config.ts`: configuration file. Since Next.js 15, the scaffold generates the TS version by default; `next.config.js` is still compatible

**Only `page.tsx` and `route.ts` generate accessible routes**; other files (components, utility functions, `layout.tsx`) placed in `app/` will not be exposed as URLs.

## 3. Routing and Layouts

Folder names are path segments; `app/dashboard/invoices/page.tsx` maps to `/dashboard/invoices`. `layout.tsx` wraps all child routes at the same segment and below, and **stays mounted without re-rendering during navigation**, so state and scroll position are preserved.

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

Several conventions:

- The root layout `app/layout.tsx` must contain `<html>` and `<body>`, and there can be only one
- Layouts nest; child layouts render in the parent layout's `children` position
- Directories in parentheses `(overview)` are route groups; they do not affect the URL and are only for sharing layouts

### 3.1 Dynamic Segments and params

`app/dashboard/invoices/[id]/page.tsx` matches `/dashboard/invoices/123`. **Since Next.js 15, `params` and `searchParams` are Promises and must be `await`ed**; direct destructuring gives you a Promise rather than the value:

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

Use `[...slug]` to capture all subsequent segments, and `[[...slug]]` for optional segments.

## 4. Styling: Tailwind CSS

The scaffold now installs Tailwind v4. **There are no longer the three `@tailwind base/components/utilities` directives**, and `tailwind.config.js` is not generated by default. Instead, import it in one line in CSS:

```css
/* app/ui/global.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(58% 0.2 255);
}
```

Mount `@tailwindcss/postcss` in `postcss.config.mjs`; that is all the integration work. If you keep the v3 approach (`@tailwind` directives + `content` config), styles will not be generated under v4.

Import global styles in the root layout:

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

After that, compose class names directly in components; `<h1 className="text-blue-500">` is enough. For conditional class names, prefer `clsx` or template string concatenation rather than manually adding strings.

## 5. Fonts and Images

`next/font` downloads font files at build time and self-hosts them, eliminating requests to external domains, while automatically generating `size-adjust` to reduce layout shift:

```tsx
// app/ui/fonts.ts
import { Inter, Lusitana } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'] });
export const lusitana = Lusitana({ weight: ['400', '700'], subsets: ['latin'] });
```

Apply it in the root layout:

```tsx
import { inter } from '@/app/ui/fonts';

<body className={`${inter.className} antialiased`}>{children}</body>
```

Chinese fonts are usually too large; `next/font/google` downloads slowly and its subsets are incomplete. For Chinese projects, a more practical approach is to use `next/font/local` pointing to `woff2` files under `public/fonts`.

`next/image` provides size optimization, lazy loading, and format conversion:

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

You must provide `width`/`height` (or use `fill` with a positioned parent), otherwise it reports missing dimensions. For remote images, declare the domain in `images.remotePatterns` in `next.config.ts`; undeclared domains will throw an error rather than silently degrade.

## 6. Navigation and Streaming Rendering

`<Link>` prefetches the target route's code and RSC payload when in the viewport, so navigation does not require a full page refresh:

```tsx
import Link from 'next/link';

{links.map((link) => (
  <Link key={link.name} href={link.href}>{link.name}</Link>
))}
```

To highlight the current item, compare with `usePathname()` in a client component; `Link` itself does not provide active-state styling.

### 6.1 Chunked Loading

Slow data should not block the entire page. Two approaches:

| Approach | Use case |
|---|---|
| `loading.tsx` | Skeleton for the initial load of the entire route segment |
| `<Suspense fallback>` | Local skeleton for an async component within a page |

```tsx
import { Suspense } from 'react';

<div className="grid gap-6 md:grid-cols-4">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

Components inside a `<Suspense>` boundary stream independently, while the rest renders as soon as it is ready. `loading.tsx` is essentially wrapping the whole segment in a Suspense layer; the two can be stacked.

## 7. Search and Pagination

In the App Router, search and pagination state lives in the URL, read via `searchParams`, with results rendered on the server, and links can be shared directly:

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

- For the input, use `useSearchParams()` + `useRouter().replace()` to update the URL, with a 300ms debounce to avoid sending a request on every keystroke
- In pagination links, merge `page` into the query object before passing it to `href`, and carry over the other query parameters as-is
- Reuse the data query function; pagination and search should use the same path, and query the total count separately with `COUNT`

The `key` in `<Suspense key={query + currentPage}>` must change with the query conditions, otherwise switching will reuse the old component's state.

## 8. Data Fetching

A Server Component can simply be written as `async` and runs on the server; neither `fetch` nor database queries end up in the client bundle:

```tsx
export default async function Page() {
  const invoices = await sql`SELECT * FROM invoices LIMIT 10`;
  return <Table invoices={invoices} />;
}
```

### 8.1 Caching Semantics

As of Next.js 15, `fetch` is **not cached by default**, equivalent to `cache: 'no-store'` (v14 and earlier cached aggressively by default; this is one of the biggest behavior changes after upgrading):

| Requirement | Usage |
|---|---|
| Fetch fresh data on every request | `fetch(url)` or explicitly `cache: 'no-store'` |
| Revalidate on a schedule | `fetch(url, { next: { revalidate: 60 } })` |
| Fetch once at build time | `export const dynamic = 'force-static'` |

After a write, to invalidate related pages, call `revalidatePath('/dashboard/invoices')` or `revalidateTag('invoices')`; the former invalidates by path, while the latter performs batch invalidation by tag after adding `next: { tags: ['invoices'] }` to `fetch`.

### 8.2 Correspondence with the Pages Router

| Pages Router | App Router |
|---|---|
| `getStaticProps` | `fetch` inside the component + `revalidate` |
| `getServerSideProps` | `fetch` inside the component, or use `cookies()`/`headers()` to automatically switch to dynamic rendering |
| `getStaticPaths` | `generateStaticParams()` |
| Fetching data with client-side `useEffect` | Prefer moving to server-side fetching; use `useSWR`/`useQuery` when interactivity is needed |

`cookies()` and `headers()` are also asynchronous as of Next.js 15 and need to be `await`ed. Calling them causes the route they are in to opt out of static rendering; this is a common accidental reason for making an entire page dynamic.

### 8.3 Forms and Writes

Use Server Actions for create, update, and delete operations: functions marked with `'use server'` can be used directly as `<form action={...}>` handlers, run on the server, and trigger `revalidatePath` when complete. This replaces the boilerplate of “create an API route + client-side `fetch`”, but it only applies to same-origin form submissions; external callers still need to go through a Route Handler.

## 9. Route Handler

APIs live in `app/api/<path>/route.ts` and export a function named after the HTTP method:

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

Differences from `pages/api`:

- The file must be named `route.ts`; you export a named function instead of a default handler. The only parameter is `request`, and the response is returned rather than sent with `res.status().json()`
- It is not cached by default; to cache a `GET`, add `export const dynamic = 'force-static'`
- Route segments can be nested; in `app/api/invoices/[id]/route.ts`, use `await params` to get the id

## 10. Errors and 404

| File | Scope |
|---|---|
| `error.tsx` | Current segment and child segments; must be `'use client'` |
| `global-error.tsx` | Errors in the root layout itself; must include its own `<html>`/`<body>` |
| `not-found.tsx` | Triggered by `notFound()` or when the path does not match |

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

`error.tsx` can only catch errors thrown while rendering its **child segments**; if the same-level `layout.tsx` errors, you need the next level up or `global-error.tsx`. `digest` is a hash of the server-side error; in production, stack traces are not sent to the client, so you need to use this value to correlate with server logs when debugging. When data does not exist, use `notFound()` to explicitly navigate to a 404, which is clearer than returning an empty list.

## 11. Metadata

For static metadata, export a `metadata` object; `keywords` is a **string array**, not a comma-separated string:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  description: '管理发票与收款状态。',
  keywords: ['acme', 'dashboard', 'invoices'],
};
```

When metadata needs to be generated dynamically from data, use `generateMetadata` instead; like the page, it can be `async`:

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  return { title: `${invoice.name} | Invoices` };
}
```

You can use only one of `metadata` and `generateMetadata` in the same file. Child segments inherit fields from the parent segment when they do not declare them; `title` can be written as `{ template: '%s | Acme', default: 'Acme' }` to add a consistent suffix.

## References

- [Next.js official docs: App Router](https://nextjs.org/docs/app)
- [Next.js data fetching and caching](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)