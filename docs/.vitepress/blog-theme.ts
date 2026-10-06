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
  copyright: copyright,
  // feed 内嵌全文，21 条 ≈ 826KB；限最近 10 条
  // filter：排除首页与分类目录页（index.md → /ai/、/backend/ …），只留真正的文章
  limit: 10,
  filter: (post) => !/(^|\/)index\.md$/.test(post.filepath)
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
  // 评论（giscus）——放顶层，中文/英文站都生效
  // 注意：曾只配置在 locales/en.ts，导致中文文章页无评论
  comment: {
    type: 'giscus',
    options: {
      repo: 'lixu33/blog',
      repoId: 'R_kgDOL5oFuA',
      category: 'Announcements',
      categoryId: 'DIC_kwDOL5oFuM4CfhlD',
      inputPosition: 'top'
    },
    label: '评论',
    mobileMinify: false,
  },
  // 首页布局：split 分栏头像 + 数据分析卡片（文章总数/本月更新/本周更新）
  home: {
    avatarMode: 'split',
    analysis: {
      articles: {
        title: ['文章总数', '本月更新', '本周更新']
      }
    }
  },
  // 首页标签云：57 个标签会把右侧栏撑到比文章列还高（实测 1204 vs 1014）
  // limit + 主题自带的「展开」按钮：默认只显示最常用的 18 个（最常用优先）
  homeTags: {
    limit: 18,
    sort: 'desc'
  },
  // 看板娘（l2d-widget）：鲸鱼娘 Live2D（Cubism 3），PC 与移动端均显示，移动端单独小尺寸
  // 模型为 CC BY-NC-SA 4.0（非商业 + 署名）：形象 上善无形（OC 溟月）/ 二次设计 ZipZipPipe / 模型 氵六青
  // 授权与来源全文见 /live2d/whale-girl-v1/NOTICE.txt、AUTHORS.txt、PROVENANCE.txt（随模型一起分发）
  oml2d: {
    model: {
      path: '/live2d/whale-girl-v1/c_0120.model3.json',
      scale: 1,
      offset: [0, 0],
    },
    position: 'bottom-left',
    size: { width: 220, height: 220 },
    mobileDisplay: true,
    mobileSize: { width: 130, height: 130 },
    // 素材署名入口：CC BY-NC-SA 4.0 要求可查的署名与来源
    menus: {
      extraItems: [
        {
          label: '看板娘素材来源',
          onClick: () => window.open('/live2d/whale-girl-v1/NOTICE.txt', '_blank')
        }
      ]
    }
  }
})

export { blogTheme }
