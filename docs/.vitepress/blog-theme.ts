// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'
import type { Theme } from '@sugarat/theme'
import { themeEN } from './locales/en'
import { buildOml2dSelf } from './oml2d-self'

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
  // 首页标签云：45 个标签，默认显示 32 个与最后一篇文章底部对齐（不含分页）
  // limit + 主题自带的「展开」按钮：默认只显示最常用的 32 个（最常用优先）
  homeTags: {
    limit: 32,
    sort: 'desc'
  },
  // 文章底部打赏按钮
  // 主题默认在**所有文档页**的 doc-after 插槽渲染（BlogApp.vue），所以时间线、分类目录页等
  // 非文章页要在各自 frontmatter 里写 `buttonAfterArticle: false` 关掉（见 blog.mjs#useButtonAfterConfig）
  // 英文文案在 locales/en.ts 覆盖
  buttonAfterArticle: {
    openTitle: '请我喝杯咖啡 ☕️',
    closeTitle: '下次一定 👋🏻',
    content: '<img src="https://img.lixu.dev/rest/2024/05/t7g1meK.webp">',
    icon: 'wechatPay'
  },
  // 看板娘（l2d-widget）：鲸鱼娘 Live2D（Cubism 3），PC 与移动端均显示，移动端单独小尺寸
  // 模型为 CC BY-NC-SA 4.0（非商业 + 署名）：形象 上善无形（OC 溟月）/ 二次设计 ZipZipPipe / 模型 氵六青
  // 授权与来源全文见 /live2d/whale-girl-v1/NOTICE.txt、AUTHORS.txt、PROVENANCE.txt（随模型一起分发）
  //
  // 键名叫 oml2dSelf 而不是 oml2d：主题只认 oml2d，改名后它不再自动渲染看板娘，
  // 改由 theme/index.ts 自己持有实例（切语言不销毁重建，只就地换文案）。
  // 结构与 l2d API 的坑集中在 oml2d-self.ts 的工厂里，这里只给中文文案；
  // 英文在 locales/en.ts（按 locale 浅合并 blog 配置，en 侧必须整键给全——同用工厂保证）。
  oml2dSelf: buildOml2dSelf({
    welcome: [
      '深海信号已连接～',
      '冒个泡泡，表示我在线',
      '上来换口气，顺便看看你',
      '今天也要游得漂亮哦',
      '洋流把你带到这儿啦',
      '别急着走，先歇一会儿'
    ],
    messages: [
      '记得多喝水～',
      '累了就点我休息一下',
      '点「休息」我就退到一边啦'
    ],
    playLabel: '玩耍',
    restLabel: '休息'
  })
})

export { blogTheme }
