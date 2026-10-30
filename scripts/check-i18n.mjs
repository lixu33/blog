#!/usr/bin/env node
/**
 * 中英配置一致性检查。
 *
 * 起因：英文站（locales/en.ts）的配置会和中文根配置（blog-theme.ts）做浅合并，
 * 于是「英文多配了一个行为字段」或「中文有、英文没覆盖且值含中文」都会造成
 * 两站行为/文案不一致，且构建不报错、页面看起来也正常，只能靠肉眼发现。
 *
 *   pnpm check:i18n
 *
 * 退出码：发现「行为不一致」返回 1（可挂 CI），仅有提示返回 0。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZH_FILE = path.join(ROOT, 'docs/.vitepress/blog-theme.ts')
const EN_FILE = path.join(ROOT, 'docs/.vitepress/locales/en.ts')

// 影响渲染行为（数量/排序/分页）而不是纯文案的键：中英必须同值或都没有
const BEHAVIOR_KEYS = new Set([
  'pageSize',
  'nextText',
  'prevText',
  'limit',
  'sort',
  'inspiringTimeout',
  'avatarMode',
  'showCount',
  'mobileMinify'
])

const CJK = /[\u4e00-\u9fff]/

/** 从 TS 源码里粗略抽出 key 路径 → 该行原文（用于判断值里有没有中文） */
function collectKeys(file, startPat) {
  const src = fs.readFileSync(file, 'utf8')
  const start = src.search(startPat)
  if (start < 0) throw new Error(`找不到配置起点：${file}`)
  const lines = src.slice(start).split('\n').slice(1)
  const stack = []
  const map = new Map()
  for (const line of lines) {
    if (/^\}\)/.test(line)) break
    if (!line.trim() || line.trim().startsWith('//')) continue
    const indent = line.length - line.trimStart().length
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/)
    if (!m) continue
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key: m[1] })
    const keyPath = stack.map((s) => s.key).join('.')
    map.set(keyPath, line.trim())
  }
  return map
}

const zh = collectKeys(ZH_FILE, /getThemeConfig\(\{/)
const en = collectKeys(EN_FILE, /defineLocaleConfig\(\{/)

const problems = []
const notices = []

// 1) 英文独有的行为键 → 一定会让英文站行为和中文不同
for (const [keyPath, line] of en) {
  const leaf = keyPath.split('.').pop()
  if (!BEHAVIOR_KEYS.has(leaf)) continue
  if (!zh.has(keyPath)) problems.push(`英文独有行为键 ${keyPath}：${line}（中文站没有，会导致数量/分页/排序不一致）`)
  else if (zh.get(keyPath) !== line) problems.push(`行为键取值不同 ${keyPath}：中文 ${zh.get(keyPath)} ≠ 英文 ${line}`)
}

// 2) 中文有、英文没覆盖，且值里是中文 → 英文站会显示中文
for (const [keyPath, line] of zh) {
  if (en.has(keyPath)) continue
  if (keyPath === 'locales' || keyPath.startsWith('locales.')) continue
  if (!CJK.test(line)) continue
  // 有子项的父键跳过（只看叶子）
  const isParent = [...zh.keys()].some((k) => k.startsWith(keyPath + '.'))
  if (isParent) continue
  notices.push(`英文未覆盖 ${keyPath}：${line} → 若该键渲染到英文站会显示中文，请在 en.ts 补译或确认可接受`)
}

console.log(`中文配置键 ${zh.size} 个，英文覆盖 ${en.size} 个\n`)
if (problems.length) {
  console.log('✗ 行为不一致：')
  for (const p of problems) console.log('  ' + p)
  console.log()
} else {
  console.log('✓ 行为键（pageSize/nextText/sort/limit 等）中英一致\n')
}
if (notices.length) {
  console.log('· 英文未覆盖的中文文案（按需确认）：')
  for (const n of notices) console.log('  ' + n)
} else {
  console.log('✓ 中文配置里的中文文案英文都已覆盖')
}

process.exit(problems.length ? 1 : 0)
