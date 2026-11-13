---
isTimeLine: true
title: DeepSeek Harness（dsh）入门：一切皆插件的智能体框架
description: DeepSeek Harness（dsh）把 agent 主循环、工具、会话、沙箱全部做成插件。内容覆盖 Node 版本要求、启动方式、profile 配置的叠加顺序、ToolDefinition 的写法、三档沙箱策略，以及配置不生效、端口参数报错等故障的排查顺序。
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

# DeepSeek Harness（dsh）入门：一切皆插件的智能体框架

本地 agent 用久了，改动需求通常落在一个尴尬的位置：想给模型加一个自己的工具、想换掉跑命令的后端、想改会话怎么存——这些都写在框架内部，只能改源码或者等上游合并。DeepSeek Harness（命令名 `dsh`，DeepSeek AI 开源，MIT 许可）把这些都挪到了配置层：模型适配器、工具注册表、会话日志、沙箱策略，连 agent 主循环本身都是插件。

这篇按「它是什么形态 → 怎么跑起来 → profile 怎么叠加 → 插件怎么写 → 哪里会踩坑」展开。版本以 npm 上 `@deepseek-ai/dsh` 的 0.2.2-rc.1 为准，官方明确标注开发者预览，接口会有破坏性变更。

## 先记住三个坐标

1. **Agent = 模型 + Harness**，dsh 只做后半截：它不训练模型，负责让模型能读写文件、执行命令、被约束、被记录
2. **配置是一棵按序叠加的插件树**，`--dump-config` 能把最终生效的树完整打出来
3. **节点版本要求 `>= 24.9.0`**，比很多教程写的 20/22 都高，照抄旧文会在启动阶段失败

## 和网页版对话的差别

| 对比项 | 网页版对话 | dsh |
|---|---|---|
| 文件访问 | 只能上传附件 | 直接读写指定工作区目录 |
| 执行命令 | 不支持 | shell 与持久终端，受沙箱策略约束 |
| 过程可见 | 中间步骤是黑盒 | 工具调用与结果逐步落盘可查 |
| 扩展方式 | 功能固定 | 加插件，可替换主循环 |

底层是 Cordis 插件框架，设计写在论文《A Programming Paradigm for Spatiotemporal Composability》里。它的关键性质是没有特权内核：每一项能力注册都是可逆副作用，插件卸载即撤销。这也是「不需要 fork 就能换实现」的前提。

## 启动：先过 Node 版本这一关

`@deepseek-ai/dsh` 在 npm 上声明的 `engines.node` 是 `>=24.9.0`。网上若干入门文章写的是 `^20.19 || >=22`，那是旧版本的要求，现在照做会直接卡住。

```bash
node -v            # 需要 v24.9.0 及以上
npx @deepseek-ai/dsh web
```

默认监听 `http://127.0.0.1:3080`，本机启动会自动打开浏览器。常用参数：

```bash
npx @deepseek-ai/dsh web --no-open      # 只起服务不开浏览器
npx @deepseek-ai/dsh web --port 8080    # 换端口
```

`--port` 这类属于 web app 的参数，必须写在 launcher 参数之后（也就是 `dsh --profile web` 之后）；写在前面会被 launcher 当成自己的参数而报未知选项。

Web UI 起来后还差两步才能干活：

1. **设置 → 模型**：填 DeepSeek 开放平台的 API Key，保存后立即生效，不用重启服务
2. **选择 workspace**：添加启动 `dsh` 时的项目目录并选中，没选之前会话输入框是锁死的

也兼容其他供应商和自定义 OpenAI 兼容端点，填入对应 base URL 即可。

## 一切皆插件：插件就是一个 `apply` 函数

官方的最小插件长这样，没有别的约定：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

`apply(ctx)` 是生命周期入口，所有能力都通过 `ctx` 注册。注册的东西跟着插件走：工具、事件监听、定时器在插件卸载时自动清理，不需要手写 `removeListener`；有外部资源（比如网络连接）要用 `ctx.effect()` 交出它的 disposer。

常用注册点对应到具体包：

| 要加的东西 | 落点 |
|---|---|
| 模型可调用的工具 | `ctx.tools`（工具注册表 + 执行管线） |
| 会话历史 | `ctx.sessions`（只追加的事件日志） |
| 沙箱与权限 | `ctx.sandbox`（策略服务） |
| 主循环 | `ctx.agentLoop`（默认实现，可整体替换） |

主循环可替换这件事是它和多数 harness 的分界：别的框架里主循环是固定的，扩展只能挂在循环外面；这里循环也是 `agent-loop` 包提供的一个实现，换掉它等于换一套执行语义。

## Profile：配置是一棵按序叠加的树

`$DSH_HOME` 默认 `~/.dsh`，每个 profile 是 `$DSH_HOME/profiles/<name>` 下的一个目录，里面只有两样东西：

- `package.json`：插件依赖，以及 `dsh.profile.bundles` 声明 bundle 的生效顺序
- `cordis.patch.yml`：你自己的补丁层

最终配置按这个顺序叠加，**后者按行整值替换前者，不做深合并**：

1. `dsh.profile.bundles` 里每个 bundle 的 patch
2. profile 自己的 `cordis.patch.yml`
3. home 级 `$DSH_HOME/cordis.patch.yml`（所有 profile 共享的本机偏好）
4. 命令行里的每个 `--patch <file>`

把树打出来看，是排查配置问题最快的办法：

```bash
dsh --profile web --dump-config                   # 含你自己所有补丁层
dsh --profile web --dump-default-config           # 只含内置 bundle 层
```

输出里每一行都会标注来自哪个文件、被哪个 overlay 改过，未命中的补丁目标会打到 stderr。配置文件只在开启 `dsh-hmr` 时热加载，否则改完要重启。

## 四种运行形态

| 形态 | 命令 | 适用场景 |
|---|---|---|
| Web UI | `dsh web` | 图形界面，逐步看工具调用 |
| 一次性任务 | `dsh --profile headless "跑测试"` | 出结果即退出，适合脚本和 CI |
| SDK | `dsh --profile sdk` | JSON-RPC over stdio，嵌进自己的程序 |
| ACP | `dsh --profile acp` | 编辑器等自动化客户端接入 |

`headless` 模式只把最终答案打到 stdout，推理增量走 stderr，退出码 `0` 为完成、非 0 为失败；不带任务文本算用法错误。它不挂任何监听端口，适合放进流水线。

## 写一个工具

工具的定义类型是 `ToolDefinition`：`name` / `description` / `parameters` 是给模型看的，`output` 声明输出的 JSON Schema，`execute` 干活。注册表组装模型请求时按白名单取值，`output`、`execute`、`timeoutMs` 这些宿主字段不会泄漏进请求。

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

子进程执行受一套文件效果策略约束，三档：

- `read-only`：命令只能读
- `workspace-write`：只能写会话工作区内
- `danger-full-access`：不做文件限制

被策略拒绝的一次调用，可以走「用户批准的一次性提权」重试，批准只对当前那次生效。官方安全说明写得很直白：沙箱、审批和权限控制能降低风险，但不保证隔离，也不能防止损害，建议放在一次性虚拟机或容器里跑，并且只授予必需的最小权限。

## 常见故障对照

| 现象 | 原因与处理 |
|---|---|
| `npx` 启动报 Node 版本不符 | engines 要求 `>=24.9.0`，教程里的 20/22 已过时 |
| 会话输入框灰色不可用 | 没有选中 workspace |
| 改了配置没反应 | 未启用 HMR，需要重启；再用 `--dump-config` 确认叠加结果 |
| 启动失败、只说某插件没起来 | 看 `$DSH_HOME/logs/startup-<时间戳>.log`，里面列出失败插件与原始堆栈 |
| `--port` 报未知参数 | launcher 参数必须在前，写成 `dsh --profile web --port 8080` |
| 只改了一项配置，结果同一块里的其它项丢了 | 补丁按行整值替换整个 `config`，不做深合并，需要写全该行 |

## 相关阅读

- [AI Agent Skills 入门：从概念到可运行的技能包](/ai/agentSkills)：dsh 的技能同样是插件，先理解 `SKILL.md` 的加载机制更好上手
- [Hermes Agent：可自托管的开源 AI 智能体](/ai/hermesAgent)：另一种自托管 harness 的取舍，常驻网关与技能沉淀
- [OpenClaw 开源 AI 助理部署指南](/ai/openclaw)：把 agent 接进消息平台的部署形态

## 参考

- 仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 文档：<https://deepseek-harness.github.io/deepseek-harness/>
- 安全说明：仓库根目录 `SAFETY.zh.md`
- Cordis 设计论文：<https://arxiv.org/abs/2608.25512>
