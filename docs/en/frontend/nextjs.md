---
isTimeLine: true
sticky: 1
title: Getting Started with Full-Stack Next.js Apps
description: "Build a Dashboard with App Router: directory conventions, nested layouts, Tailwind v4 integration, Server Component data fetching and caching, Route Handler APIs, and the three boundary files: error, not-found, and loading."
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
    content: Next.js - Building a Full-Stack App from Scratch
- - meta
  - property: og:description
    content: "Build a Dashboard with App Router: directory conventions, nested layouts, Tailwind v4, Server Component data fetching, Route Handlers, and three types of boundary files."
translatedFrom: 8253288268121ca9
---
# Getting Started with Full-Stack Next.js Applications

Copying `getServerSideProps` from old tutorials straight into the `app/` directory will throw an error immediately, and the API routes in `pages/api` won't be loaded in an App Router project either—these are the first two things you'll run into when switching from the Pages Router.

The following walks through building a Dashboard project in order: initialization and directory conventions, routing and layouts, styles and assets, data fetching and caching, writing API routes, and error boundaries. Each section notes how it maps to the Pages Router approach.

## First, Distinguish the Two Routers

| Item | App Router (`app/`) | Pages Router (`pages/`) |
|---|---|---|
| Page file | `page.tsx` | `index.tsx` / `[id].tsx` |
| Layout | `layout.tsx`, nestable | `_app.tsx`, one global layout |
| Data fetching | `async` + `fetch` inside components | `getStaticProps` / `getServerSideProps` |
| API routes | `route.ts` exports `GET`/`POST` | `api/*.js` exports a default handler |

The two can coexist, but new projects should only create `app/`. Paths with the same name under `app/` and `pages/` will conflict if both exist; delete `pages/` after migration is complete.

## 1. Initialization

Next.js 16 requires Node 20.9 or later; check your version first:

```bash
node -v
npx create-next-app@latest nextjs-dashboard --use-npm \
  --example "https://github.com/vercel/next-learn/tree/main/dashboard/starter-example"
```

Note that the command is one line; to wrap it, add a backslash. A plain line break will be split by the shell into two commands.

`create-next-app` will ask whether to use TypeScript, Tailwind, a `src/` directory, App Router, and Turbopack. This starter already has TypeScript and App Router preset, so just accept the defaults during the prompts.

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

- `app/`: route segments and components. `lib/` holds data queries and utility functions, `ui/` holds presentational components; these two directories do not add routes.
- `public/`: static assets, referenced from the root path; `/hero.png` maps to `public/hero.png`.
- `scripts/`: data seeding scripts, run via the `seed` command in `package.json`.
- `next.config.ts`: configuration file. Since Next.js 15, the scaffold generates the TS version by default; `next.config.js` is still compatible.

**Only `page.tsx` and `route.ts` generate accessible routes**; other files (components, utility functions, `layout.tsx`) placed in `app/` are not exposed as URLs.

## 3. Routing and Layouts

Folder names are path segments; `app/dashboard/invoices/page.tsx` maps to `/dashboard/invoices`. `layout.tsx` wraps all child routes at the same segment and below, and **stays mounted during navigation without re-rendering**, preserving state and scroll position.

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

A few conventions:

- The root layout `app/layout.tsx` must contain `<html>` and `<body>`, and there can be only one.
- Layouts are nested; child layouts render in the parent layout's `children` position.
- A parenthesized directory like `(overview)` is a route group; it does not affect the URL and is only used to share layouts.

### 3.1 Dynamic Segments and params

`app/dashboard/invoices/[id]/page.tsx` matches `/dashboard/invoices/123`. **Since Next.js 15, `params` and `searchParams` are Promises and must be `await`ed**; destructuring them directly gives you a Promise, not the value:

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

Use `[...slug]` to catch all subsequent segments, and `[[...slug]]` for an optional catch-all segment.

## 4. Styling: Tailwind CSS

The scaffold now installs Tailwind v4. **The three `@tailwind base/components/utilities` directives are gone**, and `tailwind.config.js` is no longer generated by default; instead, you use a single import in CSS:

```css
/* app/ui/global.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(58% 0.2 255);
}
```

Hook `@tailwindcss/postcss` into `postcss.config.mjs`; that's the entire setup. If you keep the v3 approach (`@tailwind` directives + `content` config), styles will not be generated under v4.

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

After that, compose class names directly in components, e.g. `<h1 className="text-blue-500">`. For conditional class names, prefer `clsx` or template string concatenation rather than manually adding strings.

## 5. Fonts and Images

`next/font` downloads font files at build time and self-hosts them, eliminating requests to external domains while automatically generating `size-adjust` to reduce layout shift:

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

Chinese fonts are usually too large; `next/font/google` is slow to download and its subsets are incomplete. For Chinese projects, a more practical approach is to use `next/font/local` pointing to `woff2` files under `public/fonts`.

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

You must provide `width`/`height` (or use `fill` with a positioned parent element), otherwise it will report missing dimensions. For remote images, declare the domain in `images.remotePatterns` in `next.config.ts`; undeclared domains will throw an error rather than silently degrade.

## 6. Navigation and Streaming Rendering

When in the viewport, `<Link>` prefetches the target route's code and RSC payload, so navigation does not require a full-page refresh:

```tsx
import Link from 'next/link';

{links.map((link) => (
  <Link key={link.name} href={link.href}>{link.name}</Link>
))}
```

To highlight the current item, compare with `usePathname()` in a client component; `Link` itself does not provide active-state styles.

### 6.1 Chunked Loading

Slow data should not block the entire page. Two approaches:

| Approach | Use case |
|---|---|
| `loading.tsx` | Skeleton for the initial load of an entire route segment |
| `<Suspense fallback>` | Local skeleton for a specific async component within a page |

```tsx
import { Suspense } from 'react';

<div className="grid gap-6 md:grid-cols-4">
  <Suspense fallback={<RevenueChartSkeleton />}>
    <RevenueChart />
  </Suspense>
  <LatestInvoices latestInvoices={latestInvoices} />
</div>
```

Components inside a `<Suspense>` boundary stream independently, while the rest renders as soon as it is ready. `loading.tsx` is essentially a Suspense wrapper around the entire segment; the two can be used together.

## 7. Search and Pagination

In the App Router, search and pagination state lives in the URL, is read via `searchParams`, and results are rendered on the server, so links can be shared directly:

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

- For the input field, use `useSearchParams()` + `useRouter().replace()` to update the URL, with a 300ms debounce to avoid sending a request on every keystroke.
- In pagination links, merge `page` into the query object before passing it to `href`, and carry over the other query parameters unchanged.
- Reuse the data query function so pagination and search go through the same path, and query the total count separately with `COUNT`.

The `key` in `<Suspense key={query + currentPage}>` must change with the query conditions; otherwise, the old component's state will be reused when switching.

## 8. Data Fetching

Server Components can be written directly as `async` and execute on the server, so neither `fetch` calls nor database queries end up in the client bundle:

```tsx
export default async function Page() {
  const invoices = await sql`SELECT * FROM invoices LIMIT 10`;
  return <Table invoices={invoices} />;
}
```

### 8.1 Caching Semantics

Since Next.js 15, `fetch` **does not cache by default**, which is equivalent to `cache: 'no-store'` (v14 and earlier cached aggressively by default — this is the biggest behavioral change after upgrading):

| Requirement | Syntax |
|---|---|
| Fetch fresh data on every request | `fetch(url)` or explicitly `cache: 'no-store'` |
| Revalidate on a timer | `fetch(url, { next: { revalidate: 60 } })` |
| Fetch once at build time | `export const dynamic = 'force-static'` |

To invalidate related pages after a write, call `revalidatePath('/dashboard/invoices')` or `revalidateTag('invoices')`. The former works by path; the latter requires tagging `fetch` with `next: { tags: ['invoices'] }` and then invalidates in bulk by tag.

### 8.2 Mapping from the Pages Router

| Pages Router | App Router |
|---|---|
| `getStaticProps` | `fetch` inside the component + `revalidate` |
| `getServerSideProps` | `fetch` inside the component, or `cookies()`/`headers()` to switch to dynamic rendering automatically |
| `getStaticPaths` | `generateStaticParams()` |
| Fetching data with client-side `useEffect` | Prefer fetching on the server; use `useSWR`/`useQuery` only when interactivity is required |

`cookies()` and `headers()` are also asynchronous since Next.js 15 and must be `await`ed. Calling them opts the route out of static rendering, which is a common accidental cause of a whole page becoming dynamic.

### 8.3 Forms and Writes

Use Server Actions for create, update, and delete: a function marked with `'use server'` can be passed directly as the handler for `<form action={...}>`, runs on the server, and triggers `revalidatePath` when it completes. This replaces the boilerplate of "create an API route + client-side `fetch`", but it only applies to same-origin form submissions — external callers still need a Route Handler.

## 9. Route Handlers

Put endpoints in `app/api/<path>/route.ts` and export a function named after each HTTP method:

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

- The file must be named `route.ts`, and you export named functions rather than a default handler; the only argument is `request`, and you return the response instead of calling `res.status().json()`
- No caching by default; to cache a `GET`, add `export const dynamic = 'force-static'`
- Route segments can be nested; in `app/api/invoices/[id]/route.ts`, `await params` to get the id

## 10. Errors and 404

| File | Scope |
|---|---|
| `error.tsx` | The current segment and its children; must be `'use client'` |
| `global-error.tsx` | Errors in the root layout itself; must include its own `<html>`/`<body>` |
| `not-found.tsx` | Triggered by `notFound()` or an unmatched path |

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

`error.tsx` can only catch errors thrown while rendering its **child segments**. If the sibling `layout.tsx` throws, you need the level above or `global-error.tsx`. `digest` is a hash of the server-side error; production does not send stack traces to the client, so use this value to correlate with server logs when debugging. When data does not exist, call `notFound()` to navigate to a 404 deliberately — clearer than returning an empty list.

## 11. Metadata

Export a `metadata` object for static metadata. `keywords` is a **string array**, not a comma-separated string:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices | Acme Dashboard',
  description: '管理发票与收款状态。',
  keywords: ['acme', 'dashboard', 'invoices'],
};
```

When it needs to be generated dynamically from data, switch to `generateMetadata`, which, like the page, can be `async`:

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  return { title: `${invoice.name} | Invoices` };
}
```

You can only use one of `metadata` and `generateMetadata` in the same file. Child segments inherit fields from the parent when they don't declare them, and `title` can be written as `{ template: '%s | Acme', default: 'Acme' }` to add a suffix consistently.

## Related Reading

- [TypeScript and ES6 Syntax Essentials](/en/frontend/typeScript): the type system and compiler options
- [Getting Started with Caddy: Automatic HTTPS and Reverse Proxy](/en/devops/caddy): reverse proxying and HTTPS when you go live
- [Docker from Beginner to Practice](/en/devops/docker): images and deployment for frontend artifacts

## References

- [Next.js Official Docs: App Router](https://nextjs.org/docs/app)
- [Next.js Data Fetching and Caching](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)