import BlogTheme from '@sugarat/theme'
import CategoryArticles from './CategoryArticles.vue'
import { defineComponent, h } from 'vue'

// 自定义样式重载
import './style.scss'

// 自定义主题色
import './user-theme.css'

// 包装 Layout（看板娘已改用主题内置 oml2d/l2d-widget，无需自托管 HomePet）
const Layout = defineComponent({
  setup(_, { slots }) {
    return () => [
      h(BlogTheme.Layout, null, slots)
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
  }
}
