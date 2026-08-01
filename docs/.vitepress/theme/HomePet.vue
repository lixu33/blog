<template>
  <!-- Live2D 看板猫挂载点（官方真猫 tororo 白猫 / hijiki 黑猫），仅首页显示 -->
  <div v-show="show" class="live2d-mount"></div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useData } from 'vitepress'

// 仅首页（layout: home / blog 首页）显示
const { frontmatter } = useData()
const show = computed(() => {
  const fm = frontmatter.value as any
  return fm?.layout === 'home' || !!fm?.blog
})

const loaded = ref(false)
const L2D_BASE = '/live2d/'

function loadScript(src: string, type = 'text/javascript'): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.type = type
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('加载失败: ' + src))
    document.head.appendChild(s)
  })
}

function loadCss(href: string): Promise<void> {
  return new Promise((resolve) => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = href
    l.onload = () => resolve()
    document.head.appendChild(l)
  })
}

/** 接管收起开关：常驻显示，点击收起/展开看板猫 */
function setupToggle() {
  const toggle = document.getElementById('waifu-toggle')
  const waifu = document.getElementById('waifu')
  if (!toggle || !waifu) return

  // clone 替换，移除 waifu-tips.js 绑定的默认事件
  const newToggle = toggle.cloneNode(true) as HTMLElement
  toggle.parentNode?.replaceChild(newToggle, toggle)

  // 常驻露出开关（收起状态时完全可见）
  newToggle.classList.add('waifu-toggle-active')

  newToggle.addEventListener('click', () => {
    const hidden = waifu.classList.toggle('waifu-hidden')
    // 收起时开关完全露出，展开时缩回半藏
    newToggle.classList.toggle('waifu-toggle-active', hidden)
    if (!hidden) waifu.classList.add('waifu-active')
  })
}

async function initLive2D() {
  // 移动端不加载（参考最佳实践，避免遮挡内容）
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    loaded.value = true
    return
  }
  if (loaded.value) return
  loaded.value = true
  try {
    // 1. 看板娘样式
    await loadCss(L2D_BASE + 'waifu.css')
    // 2. 核心模块（ES module，内含 chunk 动态导入）
    await loadScript(L2D_BASE + 'waifu-tips.js', 'module')
    // 3. 初始化（白猫 tororo 优先，可切黑猫 hijiki）
    const w = (window as any)
    if (w.initWidget) {
      // 清掉本地存储的模型索引，确保默认白猫
      localStorage.removeItem('modelId')
      w.initWidget({
        waifuPath: L2D_BASE + 'waifu-tips.json',
        cdnPath: L2D_BASE,               // 模型走本地
        cubism2Path: L2D_BASE + 'live2d.min.js',
        // tororo/hijiki 是 Cubism 2 模型，无需 cubism5
        cubism5Path: '',
        // 工具按钮：保留本地可用的
        tools: ['switch-model', 'switch-texture', 'photo', 'info', 'quit'],
        drag: true,                       // 可拖拽
        showToggleAfterQuit: true,
        logLevel: 'warn',
      })
      // 4. 接管收起开关
      setTimeout(setupToggle, 500)
    }
  } catch (e) {
    console.warn('[Live2D]', e)
    loaded.value = false
  }
}

function destroyLive2D() {
  // 隐藏看板娘 DOM（不销毁，切回首页可复用）
  const waifu = document.getElementById('waifu')
  if (waifu) waifu.style.display = 'none'
  const toggle = document.getElementById('waifu-toggle')
  if (toggle) toggle.style.display = 'none'
}

function showLive2D() {
  const waifu = document.getElementById('waifu')
  if (waifu) waifu.style.display = ''
  const toggle = document.getElementById('waifu-toggle')
  if (toggle) toggle.style.display = ''
}

onMounted(() => {
  if (show.value) initLive2D()
  // 路由切换时跟随显隐
  watch(show, (v) => {
    if (v) {
      initLive2D()
      // 等 DOM 渲染后再显示
      setTimeout(showLive2D, 100)
    } else {
      destroyLive2D()
    }
  })
})

onUnmounted(() => {
  destroyLive2D()
})
</script>

<style scoped>
.live2d-mount {
  display: none;
}
</style>
