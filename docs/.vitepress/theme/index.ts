import BlogTheme from '@sugarat/theme'
import CategoryArticles from './CategoryArticles.vue'

// 自定义样式重载
// import './style.scss'

// 自定义主题色
// import './user-theme.css'

export default {
  ...BlogTheme,
  enhanceApp({ app }) {
    BlogTheme.enhanceApp?.({ app } as any)
    // 注册全局组件
    app.component('CategoryArticles', CategoryArticles)
  }
}
