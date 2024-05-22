// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'
import type { Theme } from '@sugarat/theme'

const baseUrl = 'https://blog.lixu.dev'
const copyright = 'MIT License | 李旭'
const RSS: Theme.RSSOptions = {
  title: '总要写点什么',
  baseUrl,
  language: 'zh-CN',
  copyright: copyright
}


// 所有配置项，详见文档: https://theme.sugarat.top/
const blogTheme = getThemeConfig({
  // 开启RSS支持
  RSS,
  search: {
    btnPlaceholder: '搜索',
    placeholder: '搜索文档',
    emptyText: '没有搜索历史',
    heading: '共有 {{searchResult}} 个搜索结果'
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

  buttonAfterArticle: {
    openTitle: '投"币"支持',
    closeTitle: '下次一定',
    content: '<img src="https://img.lixu.dev/rest/2024/05/JwfUIeK.png">',
    icon: 'wechatPay'
  },
  // 页脚
  footer: {
    copyright: copyright
  },

  // 主题色修改
  themeColor: 'el-blue',

  // 文章默认作者
  author: '李旭',

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
