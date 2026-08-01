<script setup lang="ts">
import { computed } from 'vue'
import { withBase, useData } from 'vitepress'
import type { Theme } from '@sugarat/theme'

// 使用 VitePress 的 useData 获取主题配置
const { theme, localeIndex, site } = useData<Theme.Config>()

// 获取全部文章数据 - 支持多语言
const allArticles = computed(() => {
  const localeKeys = Object.keys(site.value.locales || {})

  // 如果没有多语言配置，直接返回 pagesData
  if (localeKeys.length === 0) {
    return theme.value?.blog?.pagesData || []
  }

  // 有多语言配置时，返回当前语言的 pagesData
  return theme.value?.blog?.locales?.[localeIndex.value]?.pagesData || []
})

// 全部文章（排除各目录 index 页），按日期降序
const articles = computed(() => {
  return allArticles.value
    .filter(article => {
      const route = article.route
      // 排除 index 页（/xxx/index 或根 index）
      return !route.endsWith('/index') && route !== '/'
    })
    .sort((a, b) => {
      const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0
      const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0
      return dateB - dateA
    })
})

// 按年份分组
const groupedByYear = computed(() => {
  const map = new Map<string, typeof articles.value>()
  for (const article of articles.value) {
    if (!article.meta.date) continue
    const year = new Date(article.meta.date).getFullYear()
    if (!map.has(String(year))) map.set(String(year), [])
    map.get(String(year))!.push(article)
  }
  // 年份降序
  return Array.from(map.entries()).sort((a, b) => Number(b[0]) - Number(a[0]))
})

function formatDate(date: string): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  })
}

function formatFullDate(date: string): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
</script>

<template>
  <div class="timeline-archive">
    <div v-if="articles.length === 0" class="empty">
      暂无文章
    </div>

    <div v-for="[year, list] in groupedByYear" :key="year" class="timeline-year">
      <h2 class="year-title">{{ year }}</h2>
      <ul class="timeline-list">
        <li v-for="article in list" :key="article.route" class="timeline-item">
          <span class="timeline-date">{{ formatDate(article.meta.date) }}</span>
          <a :href="withBase(article.route)" class="timeline-link">
            {{ article.meta.title }}
          </a>
          <span v-if="article.meta.tags?.length" class="timeline-tags">
            <span v-for="tag in article.meta.tags" :key="tag" class="timeline-tag">
              {{ tag }}
            </span>
          </span>
        </li>
      </ul>
    </div>

    <p class="timeline-total">共 {{ articles.length }} 篇文章</p>
  </div>
</template>

<style scoped>
.timeline-archive {
  margin-top: 1rem;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: var(--vp-c-text-2);
}

.timeline-year {
  margin-bottom: 2.5rem;
}

.year-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border-left: 1px solid var(--vp-c-divider);
  margin-left: 0.5rem;
  padding-left: 1.5rem;
}

.timeline-item {
  position: relative;
  margin-bottom: 0.75rem;
  padding: 0.25rem 0;
}

/* 时间轴圆点 */
.timeline-item::before {
  content: '';
  position: absolute;
  left: -1.85rem;
  top: 0.6rem;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  border: 2px solid var(--vp-c-bg);
}

.timeline-date {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-right: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.timeline-link {
  font-size: 1rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.2s ease;
}

.timeline-link:hover {
  color: var(--vp-c-brand-1);
}

.timeline-tags {
  margin-left: 0.5rem;
}

.timeline-tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  margin-right: 0.35rem;
  border-radius: 0.25rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
}

.timeline-total {
  margin-top: 2rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
}
</style>
