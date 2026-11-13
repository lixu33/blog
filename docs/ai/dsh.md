---
isTimeLine: true
title: DeepSeek Harness（dsh）：把 agent 主循环也做成插件的框架
description: DeepSeek Harness（dsh）把工具注册表、会话、沙箱和 agent 主循环都放进了插件层。本文讲 Node 版本要求、启动与配置、profile 的叠加顺序、ToolDefinition 怎么写、三档沙箱策略，以及配置改了不生效、端口参数报错这类问题的排查办法。
date: 2026-11-11
updated: 2026-11-11
tags:
- AI Agent
- 开源工具
- AI
- LLM
categories:
- 人工智能
- AI
- 人工智能应用
head:
- - meta
  - name: keywords
    content: DeepSeek Harness, dsh, AI Agent, 智能体框架, Cordis, 插件, profile, 沙箱, headless, ToolDefinition, DeepSeek
---

# DeepSeek Harness（dsh）：把 agent 主循环也做成插件的框架

给本地 agent 加一个自己的工具，多数时候会卡在同一个地方：工具注册表和主循环写在框架内部，想改只能 fork 或者等上游合并。DeepSeek Harness（命令名 `dsh`，DeepSeek AI 开源，MIT 许可）把这些挪进了配置层——工具、会话、沙箱、模型适配器都是插件，agent 主循环本身也能替换。

下面按装起来的顺序写：版本要求、启动与配置、profile 怎么叠、插件和工具怎么写，以及几个容易踩的坑。版本以 npm 上 `@deepseek-ai/dsh` 的 0.2.2-rc.1 为准，官方标注开发者预览，接口会有破坏性变更。

## 它负责的是哪一半

Agent 等于模型加 harness。模型那部分 dsh 不碰，它管的是让模型能读写文件、执行命令、被权限约束、调用留痕的那一层。

和网页版对话相比，差别在落点：网页版只能传附件，中间步骤不对外可见；dsh 直接操作你指定的目录，每次工具调用和返回都写进会话日志，事后能翻。

底层是 Cordis 插件框架，设计写在《A Programming Paradigm for Spatiotemporal Composability》里。这个架构对使用者的实际意义只有一条：没有特权内核，所有能力注册都是可撤销副作用，插件卸载时工具、事件监听、定时器一起清掉。换实现因此不需要 fork。

## 装之前先看 Node 版本

`@deepseek-ai/dsh` 在 npm 上声明的 `engines.node` 是 `>=24.9.0`。目前流传的几篇入门文章写的是 `^20.19 || >=22`，那是旧版本的要求，照做会在启动阶段失败。

```bash
node -v            # 需要 v24.9.0 及以上
npx @deepseek-ai/dsh web
```

默认监听 `http://127.0.0.1:3080`，本机启动会自动打开浏览器。两个常用参数：

```bash
npx @deepseek-ai/dsh web --no-open      # 只起服务，不开浏览器
npx @deepseek-ai/dsh web --port 8080    # 换端口
```

`--port` 属于 web app 的参数，得写在 launcher 参数之后。放到前面，launcher 会把它当成自己的选项，报未知参数。

服务起来后还有两步才能干活。设置里的「模型」填 DeepSeek 开放平台的 API Key，保存即时生效，不用重启；然后在工作区添上启动 `dsh` 时的项目目录并选中，没选之前会话输入框是灰的。它也支持其他供应商和自定义的 OpenAI 兼容端点。

## 插件就是一个 apply 函数

官方的最小插件没有别的约定：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

`apply(ctx)` 是生命周期入口，能力都通过 `ctx` 注册。注册的东西跟着插件走：工具、事件监听、定时器在卸载时自动清理，不用手写 `removeListener`；有外部资源（网络连接之类）要用 `ctx.effect()` 交出 disposer。

常用的注册点是 `ctx.tools`（工具注册表）、`ctx.sessions`（只追加的事件日志）、`ctx.sandbox`（沙箱与权限）、`ctx.agentLoop`（主循环）。

主循环可替换是它和多数 harness 的分界。别的框架里主循环固定，扩展只能挂在循环外面；这里循环本身是 `agent-loop` 包提供的一个实现，换掉它就等于换一套执行语义。

## Profile：配置是一层层叠出来的

`$DSH_HOME` 默认是 `~/.dsh`，每个 profile 是 `$DSH_HOME/profiles/<name>` 下的一个目录，里面只有两样东西：`package.json` 记录插件依赖和 `dsh.profile.bundles` 的生效顺序，`cordis.patch.yml` 是你的补丁层。

最终配置按这个顺序叠，后者按行整值替换前者，不做深合并：

1. `dsh.profile.bundles` 里每个 bundle 的 patch
2. profile 自己的 `cordis.patch.yml`
3. home 级 `$DSH_HOME/cordis.patch.yml`，所有 profile 共享
4. 命令行里的每个 `--patch <file>`

配置改了不生效，先看最终叠出来的树：

```bash
dsh --profile web --dump-config                   # 含自己所有补丁层
dsh --profile web --dump-default-config           # 只含内置 bundle 层
```

输出会标出每一行来自哪个文件、被哪个 overlay 改过，没命中的补丁目标打到 stderr。另外配置文件只在开了 `dsh-hmr` 时热加载，否则改完要重启。

## 四种运行方式

| 形态 | 命令 | 用在哪儿 |
|---|---|---|
| Web UI | `dsh web` | 图形界面，工具调用和结果逐步展开 |
| 一次性任务 | `dsh --profile headless "跑测试"` | 出结果即退出，适合脚本和 CI |
| SDK | `dsh --profile sdk` | JSON-RPC over stdio，嵌进自己的程序 |
| ACP | `dsh --profile acp` | 编辑器和别的自动化客户端接入 |

headless 只把最终答案打到 stdout，推理增量走 stderr，退出码 `0` 表示完成、非 0 表示失败；不带任务文本算用法错误。它不挂监听端口，可以直接放进流水线。

## 写一个工具

工具的类型是 `ToolDefinition`：`name`、`description`、`parameters` 给模型看，`output` 声明输出的 JSON Schema，`execute` 干活。注册表组装请求时按白名单取值，`output`、`execute`、`timeoutMs` 这些宿主字段不会进请求。

```ts
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register({
    name: 'text_stats',
    description: '统计一段文本的字符数、行数与单词数',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    async execute(args) {
      const text = String((args as { text: string }).text ?? '')
      return {
        characters: [...text].length,
        lines: text ? text.split(/\r?\n/).length : 0,
        words: text.trim() ? text.trim().split(/\s+/).length : 0
      }
    }
  })
}
```

`inject: ['tools']` 声明依赖，Cordis 会等 `tools` 服务就绪再执行 `apply`，不用自己判空。

## 安全边界

子进程执行受一套文件效果策略约束，分三档：`read-only` 只能读，`workspace-write` 只能写会话工作区，`danger-full-access` 不做文件限制。

被策略拒绝的单次调用，可以走「用户批准的一次性提权」重试，批准只对当次生效。官方安全说明写得很直接：沙箱、审批和权限控制能降低风险，但不保证隔离，也不能防止损害；建议放在一次性虚拟机或容器里跑，只授必需的最小权限。

## 几个卡住人的地方

Node 版本不符排第一，就是前面那条 `>=24.9.0`。会话输入框灰着，是没选工作区。

配置改了没反应，多半是没开 HMR，先重启；还不对就用 `--dump-config` 看叠加结果。只改了一个配置项，结果同一块里的其他项丢了，是补丁按行整值替换整个 `config` 造成的，得把该行写全。

启动失败、只说某个插件没起来，看 `$DSH_HOME/logs/startup-<时间戳>.log`，里面列了失败的插件和原始堆栈。`--port` 报未知参数，是参数位置放错了，写成 `dsh --profile web --port 8080`。

## 相关阅读

- [AI Agent Skills 入门：从概念到可运行的技能包](/ai/agentSkills)：dsh 的技能同样是插件，先弄清 `SKILL.md` 的加载机制更好上手
- [Hermes Agent：可自托管的开源 AI 智能体](/ai/hermesAgent)：另一种自托管 harness 的做法，常驻网关，技能靠任务沉淀
- [OpenClaw 开源 AI 助理部署指南](/ai/openclaw)：把 agent 接进消息平台的部署形态

## 参考

- 仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 文档：<https://deepseek-harness.github.io/deepseek-harness/>
- 安全说明：仓库根目录 `SAFETY.zh.md`
- Cordis 设计论文：<https://arxiv.org/abs/2608.25512>
