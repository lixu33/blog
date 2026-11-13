---
isTimeLine: true
title: "DeepSeek Harness (dsh): A framework that turns the agent main loop into a plugin too"
description: DeepSeek Harness (dsh) puts the tool registry, sessions, sandbox, and the agent main loop all in the plugin layer. This post covers Node version requirements, startup and configuration, profile precedence order, how to write a ToolDefinition, the three sandbox policies, and how to troubleshoot issues like configuration changes not taking effect and port parameter errors.
date: 2026-11-11
updated: 2026-11-11
tags:
- AI Agent
- Open-source tools
- AI
- LLM
categories:
- Artificial Intelligence
- AI
- AI applications
head:
- - meta
  - name: keywords
    content: DeepSeek Harness,dsh,AI Agent,Agent framework,Cordis,Plugin,profile,Sandbox,headless,ToolDefinition,DeepSeek
translatedFrom: d790445f6775cdc9
---
# DeepSeek Harness (dsh): A Framework That Turns the Agent Main Loop into a Plugin Too

Adding your own tool to a local agent often gets stuck at the same point: the tool registry and main loop live inside the framework, so changing them means forking or waiting for upstream to merge. DeepSeek Harness (command name `dsh`, open-sourced by DeepSeek AI under the MIT license) moves these into the configuration layer—tools, sessions, sandboxes, and model adapters are all plugins, and the agent main loop itself can be replaced.

The sections below follow the order you would get it running: version requirements, startup and configuration, how profiles stack, how to write plugins and tools, and a few easy pitfalls. The version is based on `@deepseek-ai/dsh` 0.2.2-rc.1 on npm; it is officially marked as a developer preview, and interfaces will have breaking changes.

## What Part It Covers

An agent equals a model plus a harness. dsh does not touch the model part; it handles the layer that lets the model read and write files, execute commands, be constrained by permissions, and leave traces of calls.

Compared with web chat, the difference is in where it operates: web chat can only accept attachments, and intermediate steps are not externally visible; dsh directly operates on the directory you specify, and every tool call and return is written to the session log for later review.

The underlying layer is the Cordis plugin framework, with the design described in "A Programming Paradigm for Spatiotemporal Composability." The practical meaning of this architecture for users is just one thing: there is no privileged kernel, and all capability registrations are revocable side effects. When a plugin is unloaded, tools, event listeners, and timers are cleaned up together. Replacing an implementation therefore does not require a fork.

## Check the Node Version Before Installing

The `engines.node` declared by `@deepseek-ai/dsh` on npm is `>=24.9.0`. Several introductory articles currently circulating say `^20.19 || >=22`; that is the requirement for older versions, and following it will fail at startup.

```bash
node -v            # 需要 v24.9.0 及以上
npx @deepseek-ai/dsh web
```

By default it listens on `http://127.0.0.1:3080`; starting it locally automatically opens the browser. Two common parameters:

```bash
npx @deepseek-ai/dsh web --no-open      # 只起服务，不开浏览器
npx @deepseek-ai/dsh web --port 8080    # 换端口
```

`--port` is a web app parameter and must be written after the launcher parameters. Put it before them, and the launcher treats it as its own option and reports an unknown parameter.

After the service is up, there are still two steps before you can work. In Settings, under "Model," enter the DeepSeek Open Platform API Key; saving takes effect immediately, with no restart. Then add the project directory from when you started `dsh` to the workspace and select it; before selecting, the session input box is grayed out. It also supports other providers and custom OpenAI-compatible endpoints.

## A Plugin Is Just an apply Function

The official minimal plugin has no other convention:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

`apply(ctx)` is the lifecycle entry point, and capabilities are registered through `ctx`. Registered things follow the plugin: tools, event listeners, and timers are automatically cleaned up on unload, with no need to manually write `removeListener`; for external resources (network connections and the like), use `ctx.effect()` to hand over a disposer.

Common registration points are `ctx.tools` (tool registry), `ctx.sessions` (append-only event log), `ctx.sandbox` (sandbox and permissions), and `ctx.agentLoop` (main loop).

A replaceable main loop is the boundary between it and most harnesses. In other frameworks the main loop is fixed, and extensions can only hang outside the loop; here the loop itself is an implementation provided by the `agent-loop` package, and replacing it means replacing a set of execution semantics.

## Profile: Configuration Stacks Layer by Layer

`$DSH_HOME` defaults to `~/.dsh`, and each profile is a directory under `$DSH_HOME/profiles/<name>` that contains only two things: `package.json` records plugin dependencies and the effective order of `dsh.profile.bundles`, and `cordis.patch.yml` is your patch layer.

The final configuration stacks in this order; each later layer replaces the former by whole line value, with no deep merge:

1. The patch of each bundle in `dsh.profile.bundles`
2. The profile's own `cordis.patch.yml`
3. The home-level `$DSH_HOME/cordis.patch.yml`, shared by all profiles
4. Each `--patch <file>` on the command line

If configuration changes do not take effect, first check the final stacked tree:

```bash
dsh --profile web --dump-config                   # 含自己所有补丁层
dsh --profile web --dump-default-config           # 只含内置 bundle 层
```

The output marks which file each line comes from and which overlay modified it; patch targets that do not match are written to stderr. In addition, configuration files hot reload only when `dsh-hmr` is enabled; otherwise, restart after changes.

## Four Run Modes

| Form | Command | Where It Is Used |
|---|---|---|
| Web UI | `dsh web` | Graphical interface, with tool calls and results expanded step by step |
| One-off task | `dsh --profile headless "run tests"` | Exits once the result is produced, suitable for scripts and CI |
| SDK | `dsh --profile sdk` | JSON-RPC over stdio, embedded into your own program |
| ACP | `dsh --profile acp` | Connected to by editors and other automation clients |

headless prints only the final answer to stdout, with reasoning deltas going to stderr; exit code `0` means completion, non-zero means failure; no task text counts as a usage error. It does not listen on a port and can be put directly into a pipeline.

## Write a Tool

The tool type is `ToolDefinition`: `name`, `description`, and `parameters` are shown to the model, `output` declares the output JSON Schema, and `execute` does the work. When assembling a request, the registry takes values by whitelist; host fields such as `output`, `execute`, and `timeoutMs` do not enter the request.

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

`inject: ['tools']` declares the dependency; Cordis waits until the `tools` service is ready before executing `apply`, so there is no need to null-check yourself.

## Security Boundary

Subprocess execution is constrained by a file effect policy, with three levels: `read-only` allows only reads, `workspace-write` allows writes only to the session workspace, and `danger-full-access` imposes no file restrictions.

A single call rejected by policy can be retried via "one-time elevation approved by the user"; approval is effective only for that call. The official security notes are very direct: sandboxing, approval, and permission controls reduce risk, but do not guarantee isolation and cannot prevent harm; running in a disposable VM or container is recommended, with only the necessary minimum permissions granted.

## A Few Places That Trip People Up

Node version mismatch ranks first—that is the `>=24.9.0` requirement above. A grayed-out session input box means no workspace has been selected.

If configuration changes have no effect, it is most likely that HMR is not enabled; restart first. If it is still wrong, use `--dump-config` to see the overlay result. If you changed only one configuration item and other items in the same block were lost, that is caused by the patch replacing the entire `config` by whole line value; you need to write that line in full.

If startup fails and it only says that some plugin did not start, check `$DSH_HOME/logs/startup-<timestamp>.log`, which lists the failed plugins and the original stack. If `--port` reports an unknown parameter, the parameter is in the wrong position; write it as `dsh --profile web --port 8080`.

## Related Reading

- [AI Agent Skills Introduction: From Concept to Runnable Skill Package](/en/ai/agentSkills): dsh skills are also plugins; first understand the `SKILL.md` loading mechanism to get started more easily
- [Hermes Agent: A Self-Hostable Open-Source AI Agent](/en/ai/hermesAgent): another approach to a self-hosted harness, with a persistent gateway and skills accumulated through tasks
- [OpenClaw Open-Source AI Assistant Deployment Guide](/en/ai/openclaw): a deployment form that connects the agent to messaging platforms

## References

- Repository: <https://github.com/deepseek-ai/deepseek-harness>
- Documentation: <https://deepseek-harness.github.io/deepseek-harness/>
- Security notes: `SAFETY.zh.md` in the repository root
- Cordis design paper: <https://arxiv.org/abs/2608.25512>