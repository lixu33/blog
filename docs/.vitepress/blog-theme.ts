// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'
import type { Theme } from '@sugarat/theme'
import { themeZH } from './locales/zh'
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
  mermaid: true,
  // 页脚
  footer: {
    copyright: copyright
  },
  // 主题色修改
  themeColor: 'el-blue',
  // 文章默认作者
  author: '烟霞不系舟',
  // 首页布局：split 分栏头像 + 数据分析卡片（文章总数/本月更新/本周更新）
  home: {
    avatarMode: 'split',
    analysis: {
      articles: {
        title: ['文章总数', '本月更新', '本周更新']
      }
    }
  },
  // 首页标签云
  homeTags: true,
  // 看板娘（l2d-widget）：少前 Kar98k，PC 与移动端均显示，移动端单独小尺寸
  oml2d: {
    model: {
      path: 'https://model.hacxy.cn/Kar98k-normal/model.json',
    },
    position: 'bottom-right',
    size: { width: 220, height: 220 },
    mobileDisplay: true,
    mobileSize: { width: 130, height: 130 },
  }
})

export { blogTheme }
