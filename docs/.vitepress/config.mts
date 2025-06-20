import { defineConfig } from 'vitepress'
import { pagefindPlugin } from 'vitepress-plugin-pagefind'

// 导入主题的配置
import { blogTheme } from './blog-theme'
// Vitepress 默认配置
// 详见文档：https://vitepress.dev/reference/site-config
const base = '/'
export default defineConfig({
  // 继承博客主题(@sugarat/theme)
  extends: blogTheme,
  sitemap: {
    hostname: 'https://blog.lixu.dev',
  },
  cleanUrls: true,
  base,
  lang: 'zh-CN',
  title: '总要写点什么',
  description: '基于 vitepress 实现',
  lastUpdated: true,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-cn'
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/'
    }
  },
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [
    ['link', { rel: 'icon', href: '${base}favicon.ico' }],
    ['meta', { name: "baidu-site-verification", content: "codeva-4Bhgo9DJEi" }],
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
      {
        text: '个人链接',
        items: [
          {
            text: 'Lobe-Chat',
            link: 'https://lobe.lixu.dev'
          },
          {
            text: 'IT工具',
            link: 'https://tools.lixu.dev'
          },
          {
            text: 'Alist',
            link: 'https://alist.lixu.dev'
          },
          {
            text: 'AI唱歌评分',
            link: 'https://singing-coach.lixu.dev'
          }
        ]
      }
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/lixu33/blog'
      }
    ]
  },
  vite: {
    plugins: [pagefindPlugin()],
  }
})
