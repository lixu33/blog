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
      <h2 class="year-title">
        {{ year }}
        <span class="year-count">{{ list.length }} 篇</span>
      </h2>
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
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 1.25rem;
  color: var(--vp-c-text-1);
}

.year-count {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
}

.timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
  margin-left: 0.35rem;
  padding-left: 1.6rem;
  border-left: 2px solid var(--vp-c-divider);
  position: relative;
}

/* 渐变时间轴 */
.timeline-list::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(
    180deg,
    var(--vp-c-brand-1) 0%,
    var(--vp-c-divider) 30%,
    var(--vp-c-divider) 100%
  );
  opacity: 0.6;
}

.timeline-item {
  position: relative;
  margin-bottom: 0.9rem;
  padding: 0.35rem 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem 0;
}

/* 标题占据中间弹性空间，标签推到右侧，整行铺满 */
.timeline-link {
  flex: 1;
  min-width: 12rem;
}

.timeline-tags {
  margin-left: 1rem;
  margin-right: 0.25rem;
  display: inline-flex;
  gap: 0.35rem;
  justify-content: flex-end;
}

/* 时间轴圆点 - 品牌色 + 发光 */
.timeline-item::before {
  content: '';
  position: absolute;
  left: -2.05rem;
  top: 0.72rem;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-bg), 0 0 8px var(--vp-c-brand-soft);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.timeline-item:hover::before {
  transform: scale(1.25);
  box-shadow: 0 0 0 3px var(--vp-c-bg), 0 0 12px var(--vp-c-brand-1);
}

.timeline-date {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  margin-right: 0.9rem;
  font-variant-numeric: tabular-nums;
  min-width: 3rem;
  letter-spacing: 0.02em;
}

.timeline-link {
  font-size: 1rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.2s ease, transform 0.2s ease;
  line-height: 1.6;
}

.timeline-link:hover {
  color: var(--vp-c-brand-1);
}



.timeline-tag {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0.08rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
  transition: color 0.2s ease, border-color 0.2s ease;
}

.timeline-tag:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.timeline-total {
  margin-top: 2rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  text-align: center;
}
</style>
