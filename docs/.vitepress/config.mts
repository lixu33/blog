import { defineConfig } from 'vitepress'
import { pagefindPlugin } from 'vitepress-plugin-pagefind'

// 导入主题的配置
import { blogTheme } from './blog-theme'
// Vitepress 默认配置
// 详见文档：https://vitepress.dev/reference/site-config
const base = '/'
// 站点权威域名（canonical 与结构化数据共用）
const siteUrl = 'https://blog.lixu.dev'
const siteTitle = '总要写点什么'
const siteDesc = '烟霞不系舟的个人博客 — AI、前后端、DevOps、安全领域的实战经验与技术笔记'
const authorName = '烟霞不系舟'

export default defineConfig({
  // 继承博客主题(@sugarat/theme)
  extends: blogTheme,
  sitemap: {
    hostname: 'https://blog.lixu.dev',
    // 只收录纯文章页：排除首页、分类目录页（/ai/ 等 index）、英文站、时间线归档页
    transformItems: (items) =>
      items.filter((item) => {
        let url = item.url
        // VitePress 生成 item.url：首页为空串、目录页为 "ai/"、文章页为 "ai/xxx"，统一规范化
        if (url.startsWith('http')) url = new URL(url).pathname
        const path = url.replace(/^\/+|\/+$/g, '')
        if (path === '' || path === 'en' || path === 'timeline') return false
        if (url.endsWith('/')) return false // 目录/归档页（index.md → "ai/"）
        return true
      }),
  },
  cleanUrls: true,
  base,
  lang: 'zh-CN',
  title: siteTitle,
  description: siteDesc,
  lastUpdated: true,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN'
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/'
    }
  },
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.ico` }],
    ['meta', { name: "baidu-site-verification", content: "codeva-4Bhgo9DJEi" }],
    // 默认 og 标签（文章页会被下方 transformHead 覆盖为动态值）
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: `${siteUrl}/logo.png` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: siteTitle }],
    ['meta', { name: 'twitter:description', content: siteDesc }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}/logo.png` }],
    // Cloudflare Web Analytics：免费、无 cookie、数据保留不限（手动安装模式，站点未走 CF 代理）
    [
      'script',
      {
        defer: '',
        src: 'https://static.cloudflareinsights.com/beacon.min.js',
        'data-cf-beacon': JSON.stringify({ token: 'c47e566c70c54c6bbb58f0a7977542e1' })
      }
    ],
    [
      'script',
      { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-231Y53GHPL' }
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-231Y53GHPL');`
    ]
  ],
  themeConfig: {
    // 展示 2,3 级标题在目录中
    outline: {
      level: [2, 3],
      label: '目录'
    },
    // 默认文案修改
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '相关文章',
    lastUpdatedText: '上次更新于',
    // 设置logo
    logo: '/logo.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '时间线', link: '/timeline' },
      {
        text: '个人链接',
        items: [
          { text: 'Lobe-Chat', link: 'https://lobe.lixu.dev' },
          { text: 'IT工具', link: 'https://tools.lixu.dev' },
          { text: 'Alist', link: 'https://alist.lixu.dev' },
          { text: 'AI睡前故事', link: 'https://ai-story.lixu.dev' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/lixu33/blog' }
    ]
  },
  vite: {
    plugins: [pagefindPlugin()],
  },
  // 每页动态注入 canonical / JSON-LD 结构化数据 / 文章级 og 标签
  // 参考：https://vitepress.dev/reference/site-config#transformhead
  transformHead({ pageData, title, description }) {
    const head = []
    const isArticle = !!pageData.frontmatter?.date
    const rawPath = pageData.relativePath || ''
    // 转成线上规范路径：xxx.md → /xxx；index.md → /
    const cleanPath = rawPath
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '$1')
    const url = cleanPath === '' ? siteUrl : `${siteUrl}/${cleanPath}`

    // 1. canonical：声明当前页权威地址（cleanUrls 下避免重复内容）
    head.push(['link', { rel: 'canonical', href: url }])

    // 2. 动态 og / twitter 标签（文章页用文章标题与描述，而非站点名）
    head.push(['meta', { property: 'og:title', content: title }])
    head.push(['meta', { property: 'og:description', content: description || siteDesc }])
    head.push(['meta', { property: 'og:url', content: url }])
    head.push(['meta', { name: 'twitter:title', content: title }])
    head.push(['meta', { name: 'twitter:description', content: description || siteDesc }])

    // 3. JSON-LD 结构化数据（文章页 → BlogPosting；首页 → WebSite）
    if (isArticle) {
      const fm = pageData.frontmatter
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: title,
        description: description || siteDesc,
        datePublished: fm.date || '',
        dateModified: fm.date || '',
        author: { '@type': 'Person', name: authorName },
        publisher: { '@type': 'Person', name: authorName },
        mainEntityOfPage: url,
        image: `${siteUrl}/logo.png`,
        keywords: Array.isArray(fm.tags) ? fm.tags.join(', ') : ''
      }
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify(jsonLd)])
    } else {
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteTitle,
        description: siteDesc,
        url: siteUrl
      }
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify(jsonLd)])
    }

    return head
  }
})
