import BlogTheme from '@sugarat/theme'
import CategoryArticles from './CategoryArticles.vue'
import TimelineArchive from './TimelineArchive.vue'
import { defineComponent, h, onMounted, watch } from 'vue'
import { useData } from 'vitepress'

// 自定义样式重载
import './style.scss'

// 自定义主题色
import './user-theme.css'

// 看板娘菜单图标收口到同源。
// l2d-widget 把菜单的 icon 字段（'mdi:bed'）硬编码成 `https://api.iconify.design/<prefix>/<name>.svg`
// 在运行时去拉（见 node_modules/.../l2d-widget/dist/index.js 的 createMenuButton），是个跨域第三方请求，
// 国内不稳、白付一次 DNS+TLS。这里把这一个 host 改写到站点自己的 /live2d/icons/（文件随站点分发，
// 并已由 vercel.json 的 /live2d/(.*) 规则吃到 immutable 长缓存）。只改写匹配前缀的请求，其余原样透传。
// 必须在看板娘建菜单之前生效：主题模块在客户端先于 onMounted 加载，所以放在模块作用域即可。
if (typeof window !== 'undefined') {
  const ICONIFY_PREFIX = 'https://api.iconify.design/'
  const ICON_MIRROR = `${import.meta.env.BASE_URL}live2d/icons/`
  const originalFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input
        : input instanceof URL ? input.href
          : input instanceof Request ? input.url
            : ''
    if (url.startsWith(ICONIFY_PREFIX)) {
      const target = ICON_MIRROR + url.slice(ICONIFY_PREFIX.length)
      return input instanceof Request
        ? originalFetch(new Request(target, input), init)
        : originalFetch(target, init)
    }
    return originalFetch(input as RequestInfo, init)
  }) as typeof window.fetch
}

// ─────────────────────────────────────────────────────────────────────────────
// 看板娘：自己持有实例，切语言不销毁重建
//
// 为什么不用主题内置的 oml2d：
//   主题的 BlogOml2d 硬编码在 BlogApp 里，且只在 onMounted 创建一次。要让文案跟随语言，
//   之前只能给 Layout 换 key（BlogApp 重挂载 → destroy + 重建）。代价是切语言时旧看板娘滑出、
//   新看板娘滑入，两个节点同屏约 2.5s，视觉上"消失又冒出来"，休息状态也会丢。
//
// 现在的做法（配置键改名为 oml2dSelf，主题不再渲染它）：
//   - 实例只在站点首次挂载时创建一次，切语言不重建 → 无闪烁、无空白期、休息状态天然保持
//   - 语言切换时就地改文案：菜单按钮的 title/文本直接改 DOM；tips 靠"原地替换数组内容"生效
//     （l2d-widget 的 Jo() 对 welcomeMessage/messages 是直接引用而非拷贝，改内容即可，
//      循环提示的 setInterval 每次都会重新读数组，所以下一句就是新语言）
//   - 配置结构与主题一致：中文在 blog.oml2dSelf，英文在 blog.locales.en.oml2dSelf
// ─────────────────────────────────────────────────────────────────────────────
type AnyRecord = Record<string, any>

let widget: any = null
let createdOptions: AnyRecord | null = null
let creating = false

/** 读取当前语言的看板娘配置（与主题 resolveConfig 的合并方式一致） */
function readOml2dConfig(themeConfig: any, locale: string): AnyRecord | undefined {
  const blog = themeConfig?.blog ?? {}
  const merged = { ...blog, ...(blog.locales?.[locale] ?? {}) }
  return merged.oml2dSelf
}

/** 原地替换数组内容，保持引用不变（库持有的是同一个数组） */
function replaceArray(target: unknown, source: unknown) {
  if (!Array.isArray(target) || !Array.isArray(source)) return
  target.splice(0, target.length, ...source)
}

/** 把已创建实例的文案更新成当前语言 */
function syncOml2dText(themeConfig: any, locale: string) {
  const cfg = readOml2dConfig(themeConfig, locale)
  if (!cfg || !createdOptions) return

  const root = document.querySelector('body > div[style*="z-index: 9999"]')
  // 数组是原地替换的，替换后就分不清哪句是哪句了：先把旧文案留一份，
  // 用来把"此刻正在显示的那句气泡"翻译成新语言。
  const oldTips = createdOptions.model?.tips
  const prevWelcome: string[] = Array.isArray(oldTips?.welcomeMessage) ? [...oldTips.welcomeMessage] : []
  const prevMessages: string[] = Array.isArray(oldTips?.messages) ? [...oldTips.messages] : []

  // 1) tips：数组引用不变，只换内容
  const newTips = cfg.model?.tips
  if (oldTips && newTips) {
    replaceArray(oldTips.welcomeMessage, newTips.welcomeMessage)
    replaceArray(oldTips.messages, newTips.messages)
    if (typeof newTips.duration === 'number') oldTips.duration = newTips.duration
    if (typeof newTips.interval === 'number') oldTips.interval = newTips.interval
  }

  // 2) 正在显示的气泡：库把文案一次性写进气泡里的 <span>，只换数组不会重绘，
  //    所以这里按旧文案反查下标、就地换成新语言的同一句（等它自然消失就太迟了）。
  if (root && Array.isArray(newTips?.messages)) {
    const newWelcome: string[] = Array.isArray(newTips.welcomeMessage) ? newTips.welcomeMessage : []
    const newMessages: string[] = newTips.messages
    const pick = (list: string[], i: number) => list[i] ?? list[0] ?? ''
    root.querySelectorAll('span').forEach((span) => {
      const text = (span.textContent || '').trim()
      if (!text) return
      const inWelcome = prevWelcome.indexOf(text)
      if (inWelcome >= 0) {
        span.textContent = pick(newWelcome, inWelcome)
        return
      }
      const inMessages = prevMessages.indexOf(text)
      if (inMessages >= 0) span.textContent = pick(newMessages, inMessages)
    })
  }

  // 3) 菜单：l2d-widget 写死 z-index: 9999 作为容器，按钮顺序与 menus.items 一致
  if (!root) return
  const buttons = root.querySelectorAll('button[title]')
  const items: AnyRecord[] = cfg.menus?.items ?? []
  items.forEach((item, i) => {
    const btn = buttons[i] as HTMLElement | undefined
    if (!btn) return
    btn.title = item.label
    // 有图标时按钮里是 <svg>，标签只作为 title；图标加载失败才回退成文字
    if (!btn.querySelector('svg')) btn.textContent = item.label
  })
}

/** 主题里硬编码的中文 UI 文案 → 英文（没有配置项，只能客户端改） */
const EN_EXACT_TEXT: Record<string, string> = {
  收起: 'Show less',
  评论: 'Comment',
  上一组文章: 'Previous group',
  下一组文章: 'Next group',
  清空并返回: 'Clear and go back',
  时间线页面: 'Timeline'
}

function patchHardcodedZhUi() {
  if (typeof document === 'undefined') return
  // 只在英文站生效：VitePress 会把 locale 写进 <html lang>
  if (!document.documentElement.lang?.startsWith('en')) return

  // 首页标签的展开/收起：文案里带数量，单独处理
  document.querySelectorAll('.card.tags .expand-btn span').forEach((el) => {
    const text = (el.textContent || '').trim()
    const withCount = text.match(/^展开全部\s*(\d+)\s*个标签$/)
    if (withCount) {
      el.textContent = `Show all ${withCount[1]} tags`
      return
    }
    if (text === '收起') el.textContent = 'Show less'
  })

  // 评论区浮动按钮（giscus 懒加载，class 可能随主题版本变，精确选择器没命中时按文本兜底）
  let patched = 0
  document.querySelectorAll('.comment-btn-wrapper .text').forEach((el) => {
    if ((el.textContent || '').trim() === '评论') {
      el.textContent = 'Comment'
      patched++
    }
  })
  if (!patched) {
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length || el.closest('.vp-doc')) return
      if ((el.textContent || '').trim() === '评论') el.textContent = 'Comment'
    })
  }

  // 其余精确文案：可见文本、title、aria-label
  document.querySelectorAll('[title], [aria-label]').forEach((el) => {
    for (const attr of ['title', 'aria-label']) {
      const v = el.getAttribute(attr)
      if (v && EN_EXACT_TEXT[v.trim()]) el.setAttribute(attr, EN_EXACT_TEXT[v.trim()])
    }
  })

  // footer 里主题色图标的 <svg><title>主题</title>（hover 提示）
  document.querySelectorAll('svg > title').forEach((el) => {
    if ((el.textContent || '').trim() === '主题') el.textContent = 'Theme'
  })
}

/** 列表页（首页/时间线/分类目录）：这些页面上看板娘正常待着，其它页面视为文章详情页 */
function isListPage() {
  const raw = window.location.pathname.replace(/\/+$/, '')
  const path = raw.replace(/\.html$/, '')
  const listPaths = new Set(['', '/index', '/en', '/en/index', '/timeline', '/en/timeline'])
  return listPaths.has(path) || raw.endsWith('/')
}

/** 看板娘休息后会在 body 下挂一个 z-index 9998 的状态条，点它可恢复 */
function findOml2dStatusBar(): HTMLElement | null {
  const nodes = [...document.body.children] as HTMLElement[]
  return (
    nodes.find(
      (el) =>
        el.tagName === 'DIV' &&
        el.id !== 'app' &&
        Number.parseInt(getComputedStyle(el).zIndex, 10) === 9998
    ) || null
  )
}

/** 文章页让看板娘休息（收起成状态条），回列表页再唤醒。
 * 用户自己点菜单休息的情况不自动唤醒，所以只处理「自动睡下」的那次。 */
let autoSleeping = false
/** 状态条有可能是资源加载中的「正在加载」，那不算休息 */
function isOml2dSleeping(): boolean {
  const bar = findOml2dStatusBar()
  if (!bar) return false
  const text = (bar.textContent || '').trim()
  return text !== '' && !/正在加载|loading/i.test(text)
}

function applyPageSleepState() {
  if (!widget) return
  if (!isListPage()) {
    if (!isOml2dSleeping()) {
      try {
        widget.sleep()
        autoSleeping = true
      } catch {
        /* 实例还没准备好，下次路由变化再试 */
      }
    }
  } else if (autoSleeping) {
    if (isOml2dSleeping()) findOml2dStatusBar()?.click()
    autoSleeping = false
  }
}

/** 给正文里的表格套一层可横向滚动的容器。
 * 手机窄屏下多列表格会被压成一字一行，套 wrapper 后可以左右滑动。 */
function wrapTables() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('.vp-doc table').forEach((table) => {
    const parent = table.parentElement
    if (!parent || parent.classList.contains('table-wrap')) return
    const wrapper = document.createElement('div')
    wrapper.className = 'table-wrap'
    parent.insertBefore(wrapper, table)
    wrapper.appendChild(table)
  })
}

/** 404 页：VitePress 只生成一个 404.html（lang 跟站点，全中文），
 * 英文站访问不存在的路径会落到同一个页面，这里按 URL 前缀补英文文案。 */
const NOT_FOUND_EN = {
  title: 'PAGE NOT FOUND',
  quote:
    "But if you don't change your direction, and if you keep looking, you may end up where you are heading.",
  linkText: 'Take me home'
}

function patchNotFound() {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/en')) return
  const box = document.querySelector('.NotFound')
  if (!box) return

  if (document.documentElement.lang !== 'en') document.documentElement.lang = 'en'
  const setText = (sel: string, text: string) => {
    const el = box.querySelector(sel)
    if (el && (el.textContent || '').trim() !== text) el.textContent = text
  }
  setText('.title', NOT_FOUND_EN.title)
  setText('.quote', NOT_FOUND_EN.quote)
  setText('.action a', NOT_FOUND_EN.linkText)

  const link = box.querySelector('.action a')
  if (link && link.getAttribute('href') !== '/en/') link.setAttribute('href', '/en/')
}

const Layout = defineComponent({
  setup(_, { slots }) {
    const { localeIndex, theme } = useData()

    const mountOml2d = async () => {
      if (creating || widget) return
      const cfg = readOml2dConfig(theme.value, localeIndex.value)
      if (!cfg) return
      const isMobile = window.matchMedia('(max-width: 768px)').matches
      if (cfg.mobileDisplay === false && isMobile) return

      const { mobileDisplay, mobileSize, ...rest } = cfg
      // model.tips 的文案数组要自己拿一份可变副本：配置对象来自 VitePress 的 siteData，
      // 在客户端会被深度冻结，直接 splice 会静默失败（严格模式下抛 TypeError），
      // 而 l2d-widget 的 Jo() 保留的是同一引用，所以改副本内容就能实时换语言。
      const srcTips = cfg.model?.tips
      const modelCopy = cfg.model
        ? {
            ...cfg.model,
            ...(srcTips
              ? {
                  tips: {
                    ...srcTips,
                    welcomeMessage: Array.isArray(srcTips.welcomeMessage)
                      ? [...srcTips.welcomeMessage]
                      : srcTips.welcomeMessage,
                    messages: Array.isArray(srcTips.messages)
                      ? [...srcTips.messages]
                      : srcTips.messages
                  }
                }
              : {})
          }
        : cfg.model
      const options: AnyRecord = {
        size: { width: 200, height: 200 },
        ...rest,
        model: modelCopy,
        ...(isMobile && mobileSize ? { size: mobileSize } : {})
      }
      createdOptions = options
      creating = true
      try {
        const { createWidget } = await import('l2d-widget')
        widget = createWidget(options)
        // 实例就绪后按当前页面决定是否直接休息（文章页收起）
        setTimeout(() => applyPageSleepState(), 400)
      } finally {
        creating = false
      }
    }

    onMounted(mountOml2d)

    // 切语言：实例不动，只刷新文案
    watch(localeIndex, (next) => syncOml2dText(theme.value, next))

    // 主题把几处 UI 文案硬编码成中文，且没有 i18n 配置项，英文站只能在客户端改写。
    // 只在 en 下改，中文站原样。
    onMounted(() => {
      let scheduled = false
      const run = () => {
        scheduled = false
        wrapTables() // 表格横向滚动，中英都生效
        applyPageSleepState() // 文章页让看板娘休息，回列表页唤醒
        patchNotFound() // 404 页：按 URL 前缀决定语言，与 locale 无关
        if (localeIndex.value !== 'en') return
        patchHardcodedZhUi()
      }
      wrapTables()
      patchNotFound()
      patchHardcodedZhUi() // 走一次，处理首屏已渲染的部分
      const observer = new MutationObserver(() => {
        if (scheduled) return
        scheduled = true
        // 评论按钮是懒加载渲染的，用 microtask 让改写紧跟在插入之后，避免中文闪一下
        queueMicrotask(run)
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      watch(localeIndex, () => setTimeout(run, 0))
    })

    return () => [h(BlogTheme.Layout, { key: localeIndex.value }, slots)]
  }
})

export default {
  ...BlogTheme,
  Layout,
  enhanceApp({ app }) {
    BlogTheme.enhanceApp?.({ app } as any)
    // 注册全局组件
    app.component('CategoryArticles', CategoryArticles)
    app.component('TimelineArchive', TimelineArchive)
  }
}
