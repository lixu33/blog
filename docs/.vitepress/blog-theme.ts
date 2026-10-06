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
  // 主题 0.5.29 用的是 l2d-widget（不再是 oh-my-live2d），API 有三处坑：
  //   1) menus.items 必须是 MenuItem[]（{ label, onClick }）；传函数会在建菜单时 for...of 崩溃，
  //      整个看板娘都不渲染。提供 items 即完全替换默认项（默认是 切换模型/休眠/About）。
  //   2) 问候语在 model.tips 内，字段名是 welcomeMessage / messages（随机取一条 / 循环播放）
  //   3) 按钮文字来自 MenuItem.label；配了 icon 就显示图标（运行时从 api.iconify.design 拉取），
  //      label 同时作为 title 提示。图标拉取失败会回退成文字。
  // 英文文案见 locales/en.ts 的 oml2d（主题按 locale 浅合并 blog 配置，须写全）
  oml2d: {
    model: {
      path: '/live2d/whale-girl-v1/c_0120.model3.json',
      scale: 1,
      offset: [0, 0],
      tips: {
        welcomeMessage: [
          '晚上好，今天过得怎么样？',
          '欢迎回来～',
          '今天也要开心哦！'
        ],
        messages: [
          '记得多喝水～',
          '累了就点我休息一下',
          '点「休息」我就退到一边啦'
        ],
        duration: 4000,
        interval: 12000,
        // 库里气泡写死 whiteSpace: nowrap + maxWidth: 200px，长文案（尤其英文）会溢出气泡。
        // width: max-content 让气泡按内容撑开（不加的话会被容器挤到 ~110px 折成多行）；
        // maxWidth 必须 ≤ 看板娘宽度——气泡是「以看板娘中心为中心」定位的，宽度超过看板娘宽度
        // 就会向左越界（移动端看板娘只有 130px）。
        style: { whiteSpace: 'normal', width: 'max-content', maxWidth: '130px' }
      }
    },
    position: 'bottom-left',
    size: { width: 220, height: 220 },
    mobileDisplay: true,
    mobileSize: { width: 130, height: 130 },
    // 菜单/状态条底色：默认 rgba(96,165,250,.9) 配 75% 白字对比度不够，
    // 换成深一号的蓝（#2563EB）保证图标和文字看得清
    primaryColor: 'rgba(37, 99, 235, 0.92)',
    menus: {
      items: [
        {
          icon: 'mdi:bed',
          label: '休息',
          onClick: (widget: { sleep: () => void }) => widget.sleep()
        }
      ]
    }
  }
})

export { blogTheme }
