<script setup lang="ts">
import { computed } from 'vue'
import { withBase, useData } from 'vitepress'
import type { Theme } from '@sugarat/theme'

interface Props {
  dir: string
}

const props = defineProps<Props>()

// 使用 VitePress 的 useData 获取主题配置
const { theme } = useData<Theme.Config>()

// 获取文章数据
const allArticles = computed(() => {
  return theme.value?.blog?.pagesData || []
})

// 过滤指定目录下的文章（排除 index.md）
const articles = computed(() => {
  const dirPrefix = `/${props.dir}/`
  return allArticles.value
    .filter(article => {
      const route = article.route
      // 匹配目录下的文章，但排除 index
      return route.startsWith(dirPrefix) && !route.endsWith(`${props.dir}/index`)
    })
    .sort((a, b) => {
      // 按日期降序排列
      const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0
      const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0
      return dateB - dateA
    })
})

function formatDate(date: string): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
</script>

<template>
  <div class="category-articles">
    <div v-if="articles.length === 0" class="empty">
      暂无文章
    </div>
    <ul v-else class="article-list">
      <li v-for="article in articles" :key="article.route" class="article-item">
        <a :href="withBase(article.route)" class="article-link">
          <div class="article-header">
            <h3 class="article-title">{{ article.meta.title }}</h3>
            <span class="article-date">{{ formatDate(article.meta.date) }}</span>
          </div>
          <p v-if="article.meta.description" class="article-description">
            {{ article.meta.description }}
          </p>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.category-articles {
  margin-top: 2rem;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: var(--vp-c-text-2);
}

.article-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.article-item {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.article-item:last-child {
  border-bottom: none;
}

.article-link {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

.article-link:hover {
  opacity: 0.8;
}

.article-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.article-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  flex: 1;
}

.article-date {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.article-description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

@media (max-width: 768px) {
  .article-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .article-date {
    font-size: 0.8125rem;
  }
}
</style>
