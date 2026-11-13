---
isTimeLine: true
title: "Getting Started with DeepSeek Harness (dsh): An Agent Framework Where Everything Is a Plugin"
description: DeepSeek Harness (dsh) makes the agent main loop, tools, sessions, and sandbox all plugins. It covers Node version requirements, startup methods, profile configuration precedence, how to write ToolDefinition, the three sandbox policies, and troubleshooting order for issues such as configurations not taking effect and port parameter errors.
date: 2026-11-11
updated: 2026-11-11
tags:
- AI Agent
- Open-source tools
- AI
- LLM
categories:
- AI
- AI
- AI Applications
head:
- - meta
  - name: keywords
    content: DeepSeek Harness,dsh,AI Agent,Agent Framework,Cordis,Plugin,profile,Sandbox,headless,ToolDefinition,DeepSeek
translatedFrom: f4c1087c63ce33df
---
# Getting Started with DeepSeek Harness (dsh): An Agent Framework Where Everything Is a Plugin

After using a local agent for a while, change requests usually land in an awkward spot: you want to add a custom tool for the model, swap out the backend that runs commands, or change how sessions are stored—but these live inside the framework, so you can either modify the source or wait for an upstream merge. DeepSeek Harness (command name `dsh`, open-sourced by DeepSeek AI under the MIT license) moves all of this into the configuration layer: model adapters, tool registry, session logs, sandbox policies—even the agent main loop itself is a plugin.

This article follows the structure: what shape it takes → how to run it → how profiles stack → how to write a plugin → where you'll hit pitfalls. The version is based on `@deepseek-ai/dsh` 0.2.2-rc.1 on npm; the official release explicitly labels it a developer preview, and interfaces will have breaking changes.

## Remember three coordinates first

1. **Agent = model + harness**, dsh only handles the latter half: it does not train models; it is responsible for enabling the model to read and write files, execute commands, be constrained, and be recorded
2. **Configuration is a plugin tree stacked in order**, and `--dump-config` can print the final effective tree in full
3. **Node version requirement is `>= 24.9.0`**, higher than the 20/22 written in many tutorials; copying old articles will fail at startup

## Differences from web chat

| Aspect | Web chat | dsh |
|---|---|---|
| File access | Can only upload attachments | Directly read and write specified workspace directories |
| Command execution | Not supported | Shell and persistent terminal, constrained by sandbox policy |
| Process visibility | Intermediate steps are a black box | Tool calls and results are written to disk step by step and can be inspected |
| Extension method | Fixed functionality | Add plugins, main loop replaceable |

Underneath is the Cordis plugin framework; the design is described in the paper "A Programming Paradigm for Spatiotemporal Composability." Its key property is that there is no privileged kernel: every capability registration is a reversible side effect, and uninstalling a plugin undoes it. This is also the prerequisite for "swapping implementations without forking."

## Startup: get past the Node version hurdle first

`@deepseek-ai/dsh` declares `engines.node` as `>=24.9.0` on npm. Several introductory articles online say `^20.19 || >=22`, which was the requirement for older versions; following that now will get you stuck immediately.

```bash
node -v            # 需要 v24.9.0 及以上
npx @deepseek-ai/dsh web
```

By default it listens on `http://127.0.0.1:3080`; when started locally it automatically opens the browser. Common parameters:

```bash
npx @deepseek-ai/dsh web --no-open      # 只起服务不开浏览器
npx @deepseek-ai/dsh web --port 8080    # 换端口
```

Parameters like `--port` belong to the web app and must be written after the launcher parameters (that is, after `dsh --profile web`); if written before, the launcher treats them as its own parameters and reports an unknown option.

After the Web UI is up, two more steps are needed before you can work:

1. **Settings → Model**: enter the API Key for the DeepSeek open platform; it takes effect immediately after saving, with no need to restart the service
2. **Select workspace**: add and select the project directory from when you started `dsh`; before selecting one, the session input box is locked

It is also compatible with other providers and custom OpenAI-compatible endpoints; just fill in the corresponding base URL.

## Everything is a plugin: a plugin is just an `apply` function

The official minimal plugin looks like this, with no other conventions:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

`apply(ctx)` is the lifecycle entry point, and all capabilities are registered through `ctx`. Registered things follow the plugin: tools, event listeners, and timers are automatically cleaned up when the plugin is uninstalled, with no need to manually write `removeListener`; for external resources (such as network connections), use `ctx.effect()` to hand over their disposer.

Common registration points map to specific packages:

| What to add | Where it goes |
|---|---|
| Model-callable tools | `ctx.tools` (tool registry + execution pipeline) |
| Session history | `ctx.sessions` (append-only event log) |
| Sandbox and permissions | `ctx.sandbox` (policy service) |
| Main loop | `ctx.agentLoop` (default implementation, can be replaced wholesale) |

The replaceable main loop is the dividing line between this and most harnesses: in other frameworks the main loop is fixed, and extensions can only hang outside the loop; here the loop is also an implementation provided by the `agent-loop` package, and replacing it is equivalent to replacing a set of execution semantics.

## Profile: configuration is a tree stacked in order

`$DSH_HOME` defaults to `~/.dsh`; each profile is a directory under `$DSH_HOME/profiles/<name>` containing only two things:

- `package.json`: plugin dependencies, plus `dsh.profile.bundles` declaring the effective order of bundles
- `cordis.patch.yml`: your own patch layer

The final configuration is stacked in this order; **the latter replaces the former by whole value per line, with no deep merge**:

1. The patch of each bundle in `dsh.profile.bundles`
2. The profile's own `cordis.patch.yml`
3. The home-level `$DSH_HOME/cordis.patch.yml` (machine preferences shared by all profiles)
4. Each `--patch <file>` on the command line

Printing the tree is the fastest way to troubleshoot configuration issues:

```bash
dsh --profile web --dump-config                   # 含你自己所有补丁层
dsh --profile web --dump-default-config           # 只含内置 bundle 层
```

Each line in the output indicates which file it comes from and which overlay modified it; patch targets that are not matched are printed to stderr. Configuration files are hot-reloaded only when `dsh-hmr` is enabled; otherwise, restart after changes.

## Four run modes

| Mode | Command | Use case |
|---|---|---|
| Web UI | `dsh web` | Graphical interface, view tool calls step by step |
| One-shot task | `dsh --profile headless "run tests"` | Exits after producing a result, suitable for scripts and CI |
| SDK | `dsh --profile sdk` | JSON-RPC over stdio, embed into your own program |
| ACP | `dsh --profile acp` | Access from editors and other automation clients |

`headless` mode prints only the final answer to stdout, reasoning deltas go to stderr, exit code `0` means completion and non-zero means failure; omitting the task text counts as a usage error. It does not listen on any port, making it suitable for pipelines.

## Writing a tool

The tool definition type is `ToolDefinition`: `name` / `description` / `parameters` are for the model to see, `output` declares the output JSON Schema, and `execute` does the work. When assembling model requests, the registry takes values by whitelist; host fields such as `output`, `execute`, and `timeoutMs` will not leak into the request.

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

`inject: ['tools']` declares a dependency; Cordis waits until the `tools` service is ready before executing `apply`, so you don't need to check for null yourself.

## Security boundary

Subprocess execution is constrained by a set of file effect policies, with three levels:

- `read-only`: commands can only read
- `workspace-write`: can only write within the session workspace
- `danger-full-access`: no file restrictions

A call rejected by the policy can be retried via "one-time privilege escalation approved by the user"; approval applies only to that current call. The official security note puts it plainly: sandboxing, approval, and permission controls reduce risk, but they do not guarantee isolation and cannot prevent damage; it is recommended to run in a disposable VM or container and grant only the minimum necessary permissions.

## Common Troubleshooting Reference

| Symptom | Cause and resolution |
|---|---|
| `npx` startup reports a Node version mismatch | The engines field requires `>=24.9.0`; the 20/22 versions in the tutorial are outdated |
| Session input box is greyed out and unavailable | No workspace selected |
| Config changes have no effect | HMR is not enabled, so a restart is required; then use `--dump-config` to confirm the merged result |
| Startup fails, saying only that a plugin did not start | Check `$DSH_HOME/logs/startup-<时间戳>.log`, which lists the failed plugins and original stack traces |
| `--port` reports an unknown argument | launcher arguments must come first; write it as `dsh --profile web --port 8080` |
| Only one config item is changed, but the other items in the same block are lost | The patch replaces the entire `config` with the full value per line, without deep merging, so the whole line must be written out |

## Related Reading

- [Getting Started with AI Agent Skills: From Concepts to Runnable Skill Packages](/en/ai/agentSkills): dsh skills are also plugins; understanding the `SKILL.md` loading mechanism first makes it easier to get started
- [Hermes Agent: A Self-Hostable Open-Source AI Agent](/en/ai/hermesAgent): the trade-offs of another self-hosted harness, with a resident gateway and skill accumulation
- [OpenClaw Open-Source AI Assistant Deployment Guide](/en/ai/openclaw): deployment patterns for connecting agents to messaging platforms

## References

- Repository: <https://github.com/deepseek-ai/deepseek-harness>
- Documentation: <https://deepseek-harness.github.io/deepseek-harness/>
- Security notes: `SAFETY.zh.md` in the repository root
- Cordis design paper: <https://arxiv.org/abs/2608.25512>