---
isTimeLine: true
title: "DeepSeek Harness (dsh): A Framework That Turns the Agent Main Loop into a Plugin"
description: DeepSeek Harness (dsh) moves the tool registry, sessions, sandbox, and agent main loop into the plugin layer. This covers its Node version requirements, startup and configuration, profile overlay order, how to write ToolDefinition, the three sandbox levels, and how to troubleshoot configs that don't take effect and port parameter errors.
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
- AI Applications
head:
- - meta
  - name: keywords
    content: DeepSeek Harness,dsh,AI Agent,Agent Framework,Cordis,Plugin,profile,Sandbox,headless,ToolDefinition,DeepSeek
translatedFrom: 4a1ade6c0e7d073d
---
# DeepSeek Harness (dsh): A framework that turns the agent main loop into a plugin

When you want to add your own tool to a local agent, you usually get stuck at the same point.

The tool registry and main loop are both inside the framework. You can't change them, so you can only fork the project or wait for an upstream merge.

DeepSeek Harness (command name `dsh`, open-sourced by DeepSeek AI under the MIT license) moves these into the configuration layer.

Tools, sessions, sandboxes, and model adapters are all plugins, and the agent main loop itself can be swapped out.

The sections below follow the order you'll encounter during installation: version, startup, how configuration is layered, and how to write a plugin.

The version referenced here is `@deepseek-ai/dsh` 0.2.2-rc.1 on npm. The official release is marked as a developer preview, and interfaces will change.

## What it actually governs

An agent equals a model plus a harness. dsh does not touch the model half.

What it governs is the layer that lets the model read and write files, run commands, be constrained by permissions, and leave an audit trail of calls.

Compared with web-based chat, the difference is where it acts.

Web chat can only accept attachments, and intermediate steps are invisible. dsh directly operates on the directory you specify, and every tool call and return is written to the session log for later inspection.

The underlying framework is Cordis, a plugin framework. The author wrote a paper explaining the design.

For me, only one point matters: there is no privileged kernel, and all capability registration is a revocable side effect.

When a plugin is unloaded, its tools, listeners, and timers are cleaned up together.

This is why you can swap implementations without forking.

## First, check the Node version

`@deepseek-ai/dsh` on npm requires `engines.node` to be `>=24.9.0`.

Several introductory articles currently circulating say `^20.19 || >=22`, but that is the requirement for an older version. If you follow them, startup will fail.

```bash
node -v            # 需要 v24.9.0 及以上
npx @deepseek-ai/dsh web
```

By default it listens on `http://127.0.0.1:3080`, and a local startup automatically opens the browser. Two commonly used arguments:

```bash
npx @deepseek-ai/dsh web --no-open      # 只起服务，不开浏览器
npx @deepseek-ai/dsh web --port 8080    # 换端口
```

`--port` is a web app argument and must be written after the launcher arguments. If you put it before them, the launcher will treat it as its own option and report an unknown argument.

After the service starts, two more steps remain.

In Settings, under "Model", enter a DeepSeek Open Platform API Key. It takes effect on save, with no restart needed. Then add the project directory used when starting `dsh` to the workspace and select it. Until it is selected, the session input box is grayed out.

It also connects to other providers and custom OpenAI-compatible endpoints.

## A plugin is just an apply function

The official minimal plugin has no other conventions:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

`apply(ctx)` is the lifecycle entry point, and capabilities are registered from `ctx`.

Whatever you register follows the plugin.

Tools, event listeners, and timers are automatically cleared on unload, so you don't need to manually call `removeListener`. For external resources, such as network connections, use `ctx.effect()` to hand over a disposer.

Remember these four common locations.

Tools are on `ctx.tools`; session history is on `ctx.sessions`, which is an append-only event log; sandbox and permissions are on `ctx.sandbox`; and the main loop is on `ctx.agentLoop`.

The fact that the main loop can be swapped is the dividing line between this and most harnesses.

In other frameworks the loop is fixed, and extensions can only hang outside the loop. Here the loop itself is an implementation from the `agent-loop` package, so replacing it means replacing the execution semantics.

## Configuration is layered on top

`$DSH_HOME` defaults to `~/.dsh`.

Each profile is a directory under `$DSH_HOME/profiles/<name>`, and it contains only two things.

`package.json` records plugin dependencies and the activation order of `dsh.profile.bundles`; `cordis.patch.yml` is your patch layer.

The final configuration is stacked in this order. Later entries replace earlier ones line by line with whole values, with no deep merge:

1. The patch from each bundle in `dsh.profile.bundles`
2. The profile's own `cordis.patch.yml`
3. The home-level `$DSH_HOME/cordis.patch.yml`, shared by all profiles
4. Each `--patch <file>` on the command line

If a configuration change doesn't take effect, first inspect the resulting tree:

```bash
dsh --profile web --dump-config                   # 含自己所有补丁层
dsh --profile web --dump-default-config           # 只含内置 bundle 层
```

The output marks which file each line comes from and which overlay changed it. Patch targets that don't match anything are written to stderr.

One more thing that's easy to forget: configuration files are hot-reloaded only when `dsh-hmr` is enabled; otherwise you must restart after changing them.

## Four ways to run it

The most intuitive is the Web UI. `dsh web` starts the service, and tool calls and results expand step by step in the interface.

For scripts and CI, use headless mode: `dsh --profile headless "run tests"`.

It prints only the final answer to stdout, while reasoning deltas go to stderr. Exit code `0` means completion, and non-zero means failure. It also doesn't listen on a port.

To embed it in your own program, use `dsh --profile sdk`, which provides JSON-RPC over stdio.

Editors and other automation clients generally connect via `--profile acp`.

## Add your own tool

The tool type is `ToolDefinition`.

`name`, `description`, and `parameters` are shown to the model; `output` declares the JSON Schema of the output; and `execute` does the work.

The registry takes values by whitelist when assembling requests. Host fields such as `output`, `execute`, and `timeoutMs` do not enter the request, so you can rest assured on this point.

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

`inject: ['tools']` declares a dependency. Cordis waits until the `tools` service is ready before running `apply`, so you don't need your own null checks.

## Only three permission levels

Subprocess execution is constrained by a file effect policy: `read-only` can only read, `workspace-write` can only write to the session workspace, and `danger-full-access` applies no file restrictions.

A single call denied by the policy can be retried via a one-time user-approved elevation. The approval applies only to that call.

The official safety notes are direct: sandboxes, approvals, and permission controls reduce risk, but they do not guarantee isolation and cannot prevent damage.

It is recommended to run it in a disposable virtual machine or container and grant only the minimum necessary permissions.

## A few places where people get stuck

Node version mismatch ranks first, as mentioned earlier: `>=24.9.0`. If the session input box is gray, no workspace has been selected.

If configuration changes have no effect, it is most likely because HMR isn't enabled; restart first. If it's still wrong, use `--dump-config` to inspect the merged result.

If you changed only one configuration item but other items in the same block disappeared, that is caused by patches replacing the entire `config` line by line with whole values. You need to write the full line.

If startup fails and only says that a plugin didn't start, check `$DSH_HOME/logs/startup-<timestamp>.log`. It lists the failed plugins and the original stack traces.

If `--port` reports an unknown argument, it is in the wrong position. Write it as `dsh --profile web --port 8080`.

## Related reading

- [AI Agent Skills intro: from concepts to runnable skill packages](/en/ai/agentSkills): dsh skills are also plugins, so it's easier to get started after understanding the `SKILL.md` loading mechanism
- [Hermes Agent: a self-hostable open-source AI agent](/en/ai/hermesAgent): another self-hosted harness, with a resident gateway and skills that accumulate through tasks
- [OpenClaw open-source AI assistant deployment guide](/en/ai/openclaw): a deployment form for connecting an agent to messaging platforms

## References

- Repository: <https://github.com/deepseek-ai/deepseek-harness>
- Docs: <https://deepseek-harness.github.io/deepseek-harness/>
- Safety notes: `SAFETY.zh.md` in the repository root
- Cordis design paper: <https://arxiv.org/abs/2608.25512>