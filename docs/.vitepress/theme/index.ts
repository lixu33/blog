import BlogTheme from '@sugarat/theme'
import CategoryArticles from './CategoryArticles.vue'
import HomePet from './HomePet.vue'
import { defineComponent, h } from 'vue'

// 自定义样式重载
import './style.scss'

// 自定义主题色
import './user-theme.css'

// 包装 Layout，挂载首页宠物（fixed 定位，不影响布局）
const Layout = defineComponent({
  setup(_, { slots }) {
    return () => [
      h(BlogTheme.Layout, null, slots),
      h(HomePet)
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
