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
  author: '烟霞不系舟'
})

export { blogTheme }
