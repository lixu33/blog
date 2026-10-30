// 把 docs/ 下的中文 Markdown 翻成英文，写到 docs/en/ 同路径。
//
// 设计要点：
// 1) 增量：英文文件 frontmatter 里记 translatedFrom=<源文件 sha256>，源文没改就跳过；
//    手工维护的英文文件（没有 translatedFrom）永远不会被覆盖。
// 2) 代码块先抽成占位符再送翻，翻完填回；行内代码/链接/HTML/组件标签要求模型原样保留，
//    翻完再做一次结构校验（代码块数、链接数、标签数），不一致就重试。
// 3) 长文按二级标题切块，避免单次请求过长导致截断。
// 4) 只翻 title / description / 正文；date、tags、分类、layout 等结构化字段原样保留。
//
// 用法：
//   NEW_API_KEY=... node scripts/translate.mjs            # 全量（增量）
//   NEW_API_KEY=... node scripts/translate.mjs --only devops/docker.md
//   NEW_API_KEY=... node scripts/translate.mjs --force    # 忽略 hash 强制重翻

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOCS = path.join(ROOT, 'docs')
const OUT_ROOT = path.join(DOCS, 'en')

const API = process.env.TRANSLATE_API || 'http://127.0.0.1:3002/v1/messages'
const KEY = process.env.NEW_API_KEY
const MODEL = process.env.TRANSLATE_MODEL || 'deepseek-v4.1-flash'
const CONCURRENCY = Number(process.env.TRANSLATE_CONCURRENCY || 3)
const MAX_CHUNK = Number(process.env.TRANSLATE_MAX_CHUNK || 3500)

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const ONLY = (() => {
  const i = args.indexOf('--only')
  return i >= 0 ? args[i + 1] : null
})()

if (!KEY) {
  console.error('缺少 NEW_API_KEY')
  process.exit(1)
}

// ── 工具 ────────────────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

function splitFile(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { frontmatter: '', body: src, hasFM: false }
  return { frontmatter: m[1], body: src.slice(m[0].length), hasFM: true }
}

/** 从 frontmatter 里取出某个顶层字段的原始行区间 */
function findField(lines, name) {
  const start = lines.findIndex((l) => new RegExp(`^${name}:`).test(l))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length) {
    const line = lines[end]
    // 下一个顶层 key：结束
    if (/^[A-Za-z_][\w-]*:/.test(line)) break
    // 顶格的列表项（- xxx）属于当前字段，其它顶格内容也结束
    if (/^\S/.test(line) && !/^-\s/.test(line)) break
    end++
  }
  return { start, end }
}

async function callModel(prompt, maxTokens = 8000) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.2,
    system:
      'You are a senior technical translator for a Chinese-to-English developer blog. ' +
      'Translate faithfully and idiomatically. Preserve every bit of Markdown syntax, ' +
      'code, URLs, HTML tags, Vue component tags and placeholder tokens exactly as given. ' +
      'Never add explanations, notes or extra content. Output only the translation.',
    messages: [{ role: 'user', content: prompt }]
  }
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const json = await res.json()
      const text = (json.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
      if (!text.trim()) throw new Error('空响应')
      return text.trim()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw lastErr
}

/** 抽出围栏代码块，换成占位符 */
function protectCode(body) {
  const blocks = []
  const out = body.replace(/^([ \t]*)(```+|~~~+)[^\n]*\n[\s\S]*?\n\1\2[^\n]*$/gm, (m) => {
    blocks.push(m)
    return `⟦CODE_${blocks.length - 1}⟧`
  })
  return { text: out, blocks }
}

function restoreCode(text, blocks) {
  // 模型有时会把占位符和下一行粘在一起（⟦CODE_0⟧## 标题），导致恢复后 ``` 和标题连成一串。
  // 先把每个占位符强制独占一行，再做替换。
  const isolated = text.replace(/⟦CODE_(\d+)⟧/g, '\n⟦CODE_$1⟧\n')
  const out = isolated.replace(/⟦CODE_(\d+)⟧/g, (_, i) => blocks[Number(i)])
  return out.replace(/\n{3,}/g, '\n\n')
}

/** 结构校验：代码块/链接/行内代码数量必须一致（按块比对，块内占位符数才是期望值） */
function checkStructure(src, dst) {
  const problems = []
  const count = (s, re) => (s.match(re) || []).length
  if (count(dst, /⟦CODE_\d+⟧/g) !== count(src, /⟦CODE_\d+⟧/g)) problems.push('代码占位符数量不符')
  const linkSrc = count(src, /\]\([^)]+\)/g)
  const linkDst = count(dst, /\]\([^)]+\)/g)
  if (linkSrc !== linkDst) problems.push(`链接数 ${linkSrc} → ${linkDst}`)
  const codeSrc = count(src, /`[^`\n]+`/g)
  const codeDst = count(dst, /`[^`\n]+`/g)
  if (codeSrc !== codeDst) problems.push(`行内代码 ${codeSrc} → ${codeDst}`)
  return problems
}

/** 递归切分：先按二级标题，过长再按三级标题，最后按空行 */
function splitLong(text, max) {
  if (text.length <= max) return [text]
  for (const sep of [/(?=^### )/m, /(?=^#### )/m]) {
    const parts = text.split(sep)
    if (parts.length > 1) return parts.flatMap((p) => splitLong(p, max))
  }
  const paras = text.split(/\n\n/)
  if (paras.length > 1) {
    const out = []
    let buf = ''
    for (const p of paras) {
      if (buf && (buf + '\n\n' + p).length > max) {
        out.push(buf)
        buf = p
      } else {
        buf = buf ? buf + '\n\n' + p : p
      }
    }
    if (buf) out.push(buf)
    return out.flatMap((p) => splitLong(p, max))
  }
  return [text]
}

/** 按二级标题把正文切成 <= MAX_CHUNK 的块 */
function chunk(text) {
  const parts = text.split(/(?=^## )/m)
  const chunks = []
  let buf = ''
  for (const p of parts) {
    if (!p.trim()) continue
    if ((buf + p).length > MAX_CHUNK && buf) {
      chunks.push(buf)
      buf = p
    } else {
      buf += p
    }
  }
  if (buf.trim()) chunks.push(buf)
  // 兜底：单块仍然超长时继续细分
  return chunks.flatMap((c) => splitLong(c, MAX_CHUNK))
}

async function translateText(text) {
  const { text: protectedText, blocks } = protectCode(text)
  const chunks = chunk(protectedText)
  const results = []
  for (const c of chunks) {
    if (!/[\u4e00-\u9fff]/.test(c)) {
      results.push(c)
      continue
    }
    let done = null
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const out = await callModel(
        'Translate the following Markdown section from Simplified Chinese to natural technical English.\n' +
          'Rules: keep Markdown structure, keep every ⟦CODE_n⟧ placeholder untouched, ' +
          'do not translate code identifiers, URLs or English technical terms.\n\n' +
          '---BEGIN---\n' + c + '\n---END---'
      )
      const problems = checkStructure(c, out)
      if (problems.length === 0) done = out
      else console.warn(`    ⚠ 结构校验失败重试: ${problems.join('; ')}`)
    }
    // 宁可整篇标记失败重来，也不要静默产出半中半英的稿子
    if (!done) throw new Error(`分块翻译未通过结构校验（长度 ${c.length}）`)
    results.push(done)
  }
  return normalizeHeadings(restoreCode(results.join(''), blocks))
}

/** 模型偶尔把 `## 标题` 粘在上一句结尾，这里按行拆回独立标题行 */
function normalizeHeadings(md) {
  return md
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('#')) return line
      return line.replace(/(\S)\s*(#{2,4} )/g, '$1\n\n$2')
    })
    .join('\n')
}

/** 让值在 YAML 里安全：含冒号/井号等特殊字符时加双引号（"Docker: From Beginner" 会解析失败） */
function yamlScalar(value) {
  const s = String(value).trim()
  if (!s) return '""'
  if (/[:#]|\s$|^\s|^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return JSON.stringify(s)
  return s
}

async function translateField(value) {
  const v = value.trim()
  if (!/[\u4e00-\u9fff]/.test(v)) return value
  const out = await callModel(
    'Translate this blog metadata value to concise English. Output only the translation, no quotes.\n\n' + v,
    400
  )
  return out.replace(/^["'`]|["'`]$/g, '').trim()
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function listSources() {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'en' || entry.name === 'public' || entry.name.startsWith('.')) continue
        walk(full)
      } else if (entry.name.endsWith('.md')) {
        files.push(full)
      }
    }
  }
  walk(DOCS)
  return files.sort()
}

async function translateOne(file) {
  const rel = path.relative(DOCS, file)
  if (ONLY && rel !== ONLY) return { rel, status: 'skip' }

  const src = fs.readFileSync(file, 'utf8')
  const { frontmatter, body, hasFM } = splitFile(src)
  const sourceHash = sha(src)
  const outPath = path.join(OUT_ROOT, rel)

  // 手工维护的英文文件（没有 translatedFrom）永远不覆盖；除非用 --only 明确点名
  if (fs.existsSync(outPath)) {
    const existing = fs.readFileSync(outPath, 'utf8')
    if (!existing.includes('translatedFrom:') && !ONLY) return { rel, status: 'manual' }
  }
  if (fs.existsSync(outPath) && !FORCE) {
    const existing = fs.readFileSync(outPath, 'utf8')
    const m = existing.match(/translatedFrom:\s*"?([0-9a-f]+)"?/)
    if (m && m[1] === sourceHash) return { rel, status: 'fresh' }
  }

  console.log(`  → ${rel}`)
  let fm = frontmatter
  if (hasFM) {
    const lines = fm.split('\n')
    for (const field of ['title', 'description']) {
      const span = findField(lines, field)
      if (!span) continue
      const raw = lines.slice(span.start, span.end).join('\n')
      const value = raw.slice(raw.indexOf(':') + 1).trim().replace(/\s+/g, ' ')
      if (!/[\u4e00-\u9fff]/.test(value)) continue
      const translated = await translateField(value)
      lines.splice(span.start, span.end - span.start, `${field}: ${yamlScalar(translated)}`)
    }
    // tags / Categories：列表项里的中文也翻掉，否则英文站会出现中文标签
    for (const field of ['tags', 'Categories', 'categories']) {
      const span = findField(lines, field)
      if (!span) continue
      const block = lines.slice(span.start, span.end)
      for (let i = 1; i < block.length; i++) {
        const m = block[i].match(/^(\s*-\s*)(.+)$/)
        if (!m || !/[\u4e00-\u9fff]/.test(m[2])) continue
        block[i] = m[1] + yamlScalar(await translateField(m[2]))
      }
      lines.splice(span.start, span.end - span.start, ...block)
    }
    // head 里嵌套的 keywords（content: a,b,c）也带中文，一并翻掉
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*content:\s*)(.+)$/)
      if (!m || !/[\u4e00-\u9fff]/.test(m[2])) continue
      const parts = m[2].split(',').map((s) => s.trim()).filter(Boolean)
      const translated = []
      for (const part of parts) translated.push(await translateField(part))
      lines[i] = m[1] + translated.join(',')
    }
    fm = lines.join('\n')
    fm += `\ntranslatedFrom: ${sourceHash}`
  }

  const translatedBody = await translateText(body)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const out = (hasFM ? `---\n${fm}\n---\n${translatedBody}` : translatedBody).replace(/\n{3,}/g, '\n\n')
  fs.writeFileSync(outPath, out, 'utf8')
  return { rel, status: 'translated' }
}

async function main() {
  const files = listSources()
  console.log(`源文件 ${files.length} 个，模型 ${MODEL}`)
  const stats = { translated: 0, fresh: 0, manual: 0, skip: 0, failed: 0 }
  const queue = [...files]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const file = queue.shift()
      try {
        const r = await translateOne(file)
        stats[r.status] = (stats[r.status] || 0) + 1
      } catch (e) {
        stats.failed++
        console.error(`  ✗ ${path.relative(DOCS, file)}: ${e.message}`)
      }
    }
  })
  await Promise.all(workers)
  console.log('完成:', JSON.stringify(stats))
  if (stats.failed) process.exitCode = 1
}

main()
