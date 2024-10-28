// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'
import type { Theme } from '@sugarat/theme'
import { themeEN } from './locales/en'

const baseUrl = 'https://blog.lixu.dev'
const copyright = 'MIT License | 烟霞不系舟'
const RSS: Theme.RSSOptions = {
  title: '总要写点什么',
  baseUrl,
  language: 'zh-CN',
  copyright: copyright
}


// 所有配置项，详见文档: https://theme.sugarat.top/
const blogTheme = getThemeConfig({
  locales: {
    en: themeEN
  },
  // 开启RSS支持
  RSS,
  search: {
    pageResultCount: 5,
    btnPlaceholder: '搜索',
    placeholder: '搜索文章',
    emptyText: '没有找到相关文章',
    heading: '结果数: {{searchResult}} 条。',
    toSelect: '选择',
    toClose: '关闭',
    toNavigate: '移动',
    searchBy: 'Powered by',
    locales: {
      en: {
        btnPlaceholder: 'Search',
        placeholder: 'Search Docs',
        emptyText: 'No results found',
        heading: 'Total: {{searchResult}} search results.',
        toSelect: 'to select',
        toClose: 'to close',
        toNavigate: 'to navigate',
        searchBy: 'Search by',
      }
    }
  },

  comment: {
    type: 'giscus',
    options: {
      repo: 'lixu33/blog',
      repoId: 'R_kgDOL5oFuA',
      category: 'Announcements',
      categoryId: 'DIC_kwDOL5oFuM4CfhlD',
      inputPosition: 'top'
    },
    mobileMinify: true
  },

  mermaid: true,

  buttonAfterArticle: {
    openTitle: '投"币"支持',
    closeTitle: '下次一定',
    content: '<img src="https://img.lixu.dev/rest/2024/05/t7g1meK.webp">',
    icon: 'wechatPay'
  },
  // 页脚
  footer: {
    copyright: copyright
  },

  // 主题色修改
  themeColor: 'el-blue',

  // 文章默认作者
  author: '烟霞不系舟',

  // 友链
  friend: [
    {
      nickname: '粥里有勺糖',
      des: '你的指尖用于改变世界的力量',
      avatar:
        'https://img.cdn.sugarat.top/mdImg/MTY3NDk5NTE2NzAzMA==674995167030',
      url: 'https://sugarat.top',
    },
    {
      nickname: 'Vitepress',
      des: 'Vite & Vue Powered Static Site Generator',
      avatar:
        'https://vitepress.dev/vitepress-logo-large.webp',
      url: 'https://vitepress.dev/',
    },
  ]
})

export { blogTheme }
