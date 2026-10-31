// 看板娘 oml2dSelf 共享基座。
// VitePress/主题按 locale **浅合并** blog 配置（resolveConfig 是 ...locales[locale] 整键替换），
// 所以英文站必须给全量对象；但两份配置只有 tips 文案和菜单 label 不同，
// 用这个工厂生成，结构改动只动一处，中英永不漂移。
//
// 主题 0.5.29+ 用 l2d-widget（不是 oh-my-live2d），API 有三处坑（都体现在这里的默认值）：
//   1) menus.items 必须是 MenuItem[]（{ label, onClick }）；传函数会在建菜单时 for...of 崩溃，
//      整个看板娘都不渲染。提供 items 即完全替换默认项（默认是 切换模型/休眠/About）。
//   2) 问候语在 model.tips 内，字段名是 welcomeMessage / messages。库没有时段判断，
//      一句话只在页面加载时随机抽一次，所以文案必须任何钟点都通用（调用方负责）。
//   3) 配了 icon 就显示图标（运行时拉取，已由 theme/index.ts 的 fetch 改写收口到本站），
//      label 同时作为 title 提示；图标拉取失败回退成文字。
// onClick 是函数字面量：VitePress 序列化配置时会保留函数源码，但闭包外的变量不会跟过去，
// 所以动作表必须写在函数体内。
export interface Oml2dTexts {
  welcome: string[]
  messages: string[]
  playLabel: string
  restLabel: string
}

export function buildOml2dSelf(t: Oml2dTexts) {
  return {
    model: {
      path: '/live2d/whale-girl-v1/c_0120.model3.json',
      scale: 1,
      offset: [0, 0],
      tips: {
        welcomeMessage: t.welcome,
        messages: t.messages,
        duration: 4000,
        interval: 12000,
        // 库里气泡写死 whiteSpace: nowrap + maxWidth: 200px，长文案（尤其英文）会溢出气泡。
        // width: max-content 让气泡按内容撑开；maxWidth 必须 ≤ 看板娘宽度——气泡以看板娘
        // 中心为中心定位，超过宽度会向左越界（移动端看板娘只有 130px）。
        style: { whiteSpace: 'normal', width: 'max-content', maxWidth: '130px' }
      }
    },
    position: 'bottom-left',
    size: { width: 220, height: 220 },
    mobileDisplay: true,
    mobileSize: { width: 130, height: 130 },
    // 默认 rgba(96,165,250,.9) 配 75% 白字对比度不够，换深一号的蓝保证图标文字看得清
    primaryColor: 'rgba(37, 99, 235, 0.92)',
    menus: {
      items: [
        {
          icon: 'mdi:party-popper',
          label: t.playLabel,
          // playMotion(group) 省略 index 时随机播该组动作；这套模型除 idle 外有 7 个动作组
          // （见 c_0120.model3.json 的 Motions），默认只循环 idle，按钮手动触发。
          onClick: (widget: { l2d?: { playMotion: (group: string) => void } }) => {
            const groups = [
              'aidale', 'selfie', 'selfieQuick', 'ketchup', 'openLid', 'bubble', 'splash'
            ]
            widget.l2d?.playMotion(groups[Math.floor(Math.random() * groups.length)])
          }
        },
        {
          icon: 'mdi:bed',
          label: t.restLabel,
          onClick: (widget: { sleep: () => void }) => widget.sleep()
        }
      ]
    }
  }
}
