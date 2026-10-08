import BlogTheme from '@sugarat/theme'
import CategoryArticles from './CategoryArticles.vue'
import TimelineArchive from './TimelineArchive.vue'
import { defineComponent, h, watch } from 'vue'
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

// 包装 Layout（看板娘已改用主题内置 oml2d/l2d-widget，无需自托管 HomePet）
// key = localeIndex：主题的 BlogOml2d 硬编码在 BlogApp 里，且只在 onMounted 创建看板娘一次，
// 不换 key 的话 SPA 切语言后菜单文案/问候语仍是旧语言（必须手动刷新）。
// 换 key -> BlogApp 重挂载 -> 看板娘 destroy + 用新 locale 的配置重建。
//
// 另需兜底清理：库的 destroy() 是 `await transitionend` 之后才 removeChild，
// 该事件不触发时旧节点会残留（隐藏但占着 WebGL 上下文）。
// 切换瞬间先记下旧节点，稍后如果还连着就强制移除。
const Layout = defineComponent({
  setup(_, { slots }) {
    const { localeIndex } = useData()
    watch(localeIndex, () => {
      const stale = Array.from(
        document.querySelectorAll('body > div[style*="z-index: 9999"]')
      ) as HTMLElement[]
      const staleBars = (Array.from(document.querySelectorAll('body > div')) as HTMLElement[])
        .filter((el) => el.style && el.style.zIndex === '9998')
      // 退场过渡是 1500ms，留足余量；已正常移除的节点 isConnected 为 false，会被跳过
      setTimeout(() => {
        ;[...stale, ...staleBars].forEach((el) => el.isConnected && el.remove())
      }, 2500)
    })
    return () => [
      h(BlogTheme.Layout, { key: localeIndex.value }, slots)
    ]
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
