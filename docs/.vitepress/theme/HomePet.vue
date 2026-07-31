<template>
  <div v-if="show" class="home-pet" @click="meow" title="戳我一下">
    <Transition name="bubble">
      <div v-if="bubble" class="pet-bubble">{{ bubbleText }}</div>
    </Transition>

    <!-- 简约小猫 SVG：颜色随主题 -->
    <svg class="pet-cat" viewBox="0 0 140 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- 尾巴 -->
      <path class="pet-tail" d="M 108 88 Q 138 78 128 52 Q 122 38 108 44" fill="none"
            stroke="currentColor" stroke-width="7" stroke-linecap="round" />
      <!-- 身体 -->
      <ellipse cx="68" cy="92" rx="52" ry="30" fill="currentColor" opacity="0.92" />
      <!-- 耳朵 -->
      <path d="M 30 52 L 22 16 L 56 34 Z" fill="currentColor" />
      <path d="M 96 52 L 104 16 L 70 34 Z" fill="currentColor" />
      <!-- 耳朵内衬 -->
      <path d="M 32 48 L 27 22 L 50 35 Z" fill="var(--vp-c-bg, #fff)" opacity="0.55" />
      <path d="M 94 48 L 99 22 L 76 35 Z" fill="var(--vp-c-bg, #fff)" opacity="0.55" />
      <!-- 头 -->
      <circle cx="63" cy="58" r="36" fill="currentColor" />
      <!-- 眼睛 -->
      <g class="pet-eye">
        <ellipse cx="48" cy="56" rx="5.5" ry="7" fill="var(--vp-c-bg, #fff)" />
        <circle cx="48" cy="58" r="3.4" fill="#1f2937" />
        <circle cx="49.4" cy="55.8" r="1.2" fill="#fff" />
      </g>
      <g class="pet-eye">
        <ellipse cx="78" cy="56" rx="5.5" ry="7" fill="var(--vp-c-bg, #fff)" />
        <circle cx="78" cy="58" r="3.4" fill="#1f2937" />
        <circle cx="79.4" cy="55.8" r="1.2" fill="#fff" />
      </g>
      <!-- 鼻子 + 嘴 -->
      <path d="M 63 66 L 60 69 L 66 69 Z" fill="var(--vp-c-bg, #fff)" opacity="0.9" />
      <path d="M 63 69 Q 63 74 57 73 M 63 69 Q 63 74 69 73" fill="none"
            stroke="var(--vp-c-bg, #fff)" stroke-width="1.6" stroke-linecap="round" opacity="0.8" />
      <!-- 胡须 -->
      <g stroke="var(--vp-c-bg, #fff)" stroke-width="1.4" stroke-linecap="round" opacity="0.65">
        <line x1="20" y1="58" x2="38" y2="62" />
        <line x1="20" y1="68" x2="38" y2="67" />
        <line x1="106" y1="58" x2="88" y2="62" />
        <line x1="106" y1="68" x2="88" y2="67" />
      </g>
      <!-- 前爪 -->
      <ellipse cx="46" cy="112" rx="10" ry="5.5" fill="currentColor" opacity="0.85" />
      <ellipse cx="68" cy="114" rx="10" ry="5.5" fill="currentColor" opacity="0.85" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useData } from 'vitepress'

// 仅首页（layout: home / blog 首页）显示
const { frontmatter } = useData()
const show = computed(() => {
  const fm = frontmatter.value as any
  return fm?.layout === 'home' || !!fm?.blog
})

const bubble = ref(false)
const bubbleText = ref('喵~')
const msgs = ['喵~', '你好呀 👋', '戳我干嘛', '咕噜咕噜~', '(=^･ω･^=)', '今天写点啥？']
let timer: ReturnType<typeof setTimeout> | null = null

function meow() {
  bubbleText.value = msgs[Math.floor(Math.random() * msgs.length)]
  bubble.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (bubble.value = false), 2000)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.home-pet {
  position: fixed;
  right: 28px;
  bottom: 96px; /* 避开回到顶部按钮 */
  width: 96px;
  cursor: pointer;
  z-index: 200;
  color: var(--vp-c-brand-1, #3b82f6);
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.25s ease;
}
.home-pet:hover {
  transform: scale(1.06);
}
.home-pet:active {
  transform: scale(0.96);
}

.pet-cat {
  width: 100%;
  display: block;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.12));
  animation: breathe 3.2s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* 眨眼 */
.pet-eye {
  animation: blink 4.4s infinite;
  transform-origin: center;
}
@keyframes blink {
  0%, 91%, 100% { transform: scaleY(1); }
  94% { transform: scaleY(0.08); }
  97% { transform: scaleY(1); }
}

/* 摇尾巴 */
.pet-tail {
  transform-origin: 108px 88px;
  animation: wag 2.6s ease-in-out infinite;
}
@keyframes wag {
  0%, 100% { transform: rotate(-10deg); }
  50% { transform: rotate(12deg); }
}

/* 气泡 */
.pet-bubble {
  position: absolute;
  bottom: calc(100% + 10px);
  right: -8px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px 12px 4px 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
}
.pet-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  right: 14px;
  border: 6px solid transparent;
  border-top-color: var(--vp-c-bg-soft);
}

.bubble-enter-active { transition: all 0.25s ease; }
.bubble-leave-active { transition: all 0.2s ease; }
.bubble-enter-from, .bubble-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 640px) {
  .home-pet { width: 72px; right: 16px; bottom: 84px; }
}
</style>
