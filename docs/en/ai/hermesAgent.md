---
isTimeLine: true
title: "Hermes Agent: A Self-Hostable Open-Source AI Agent"
description: Hermes Agent is an MIT-licensed agent open-sourced by Nous Research that turns task processes into reusable skill files and stays online long-term within a messaging gateway. It covers memory and retrieval, cron scheduling, sub-agent mechanisms, plus installation, model configuration, platform integration, Docker and VPS deployment steps, and cost estimates.
date: 2026-08-01
updated: 2026-10-31
tags:
- AI Agent
- Open-source tools
- Self-Evolution
- Personal assistant
categories:
- Artificial Intelligence
- AI
- AI Applications
head:
  - - meta
    - name: keywords
      content: Hermes Agent,AI Agent,AI Agent,Open source AI,Self-Evolution,Persistent Memory,Skills,Automation,Nous Research,Messaging bot,Self-hosted,Message Gateway,cron
translatedFrom: 5275f6cf1ec17656
---
# Hermes Agent: A Self-Hostable Open-Source AI Agent

If you want an assistant on your server that can proactively send messages, run commands, and remember what you talked about last month, the common approach is to cobble together a bot framework and then add scheduled tasks, logs, and a memory store, which gets more fragmented the more you add. Hermes Agent (by Nous Research, MIT licensed) packs these components into a single process: the message gateway connects to platforms, the model layer can switch providers, the tool layer performs actual operations, and skills and memory are persisted to disk.

The following sections cover, in order: components, installation, model and platform configuration, scheduling and parallelism, deployment forms, cost, and security boundaries.

## Three Things to Remember First

1. **One gateway process + one data directory (`~/.hermes`)** is the entire state; backup and migration only require moving this directory
2. **Models and platforms are just configuration items**; `hermes model` switches models, `hermes gateway setup` connects platforms, and no code changes are needed
3. **You need to define the permission boundary yourself**; it can execute shell commands and read/write files; run it first on an isolated machine or in a container, then move it to a host with data

## 1. What It Is

Hermes Agent is a self-hosted agent runtime that can run locally, on a VPS, in Docker, on an SSH target machine, or in a serverless sandbox. The differences from web-based chat products center on three points:

- **State beyond sessions**: conversation records, extracted preferences, and task results are all written to local storage and can be recalled across sessions
- **Tools**: terminal commands, file read/write, browser operations, web scraping, and code execution are all in the same reasoning loop
- **Accumulable workflows**: after completing a complex task, you can organize the steps into a `SKILL.md` skill and execute according to that skill next time

| Component | Responsibility |
|---|---|
| Gateway | Connect to messaging platforms, maintain sessions and delivery |
| Model layer | Call the selected provider, support switching and fallback |
| Tool layer | Actual actions such as terminal, files, browser, and search |
| Memory | Session storage, full-text search, user profile |
| Skill library | On-demand loaded `SKILL.md` directory |
| Scheduling | cron jobs, deliver results to a specified platform |

## 2. Installation

Linux / macOS / WSL2 / Termux:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc   # 或 ~/.zshrc
```

Windows (PowerShell):

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

macOS and Windows also have desktop installers that include both the CLI and a graphical interface.

After installation, do only one thing first: get a clean conversation working.

```bash
hermes setup    # 交互式向导：选供应商、填 API Key
hermes          # 进入对话
```

If `hermes` won't start or the conversation errors, check `hermes doctor` first; don't rush to add gateway, cron, or plugins. The smaller the troubleshooting surface, the easier it is to locate the issue.

## 3. Model Configuration

The model is a configuration item, not a binding relationship. `hermes model` interactively selects a provider and model; you can also use `-m` / `--provider` to specify them for a single call:

```bash
hermes -m <model> --provider <provider>
hermes status           # 看当前模型、provider、各部件状态
hermes fallback         # 主模型失败时的备用供应商
```

Supported options include Nous Portal, OpenRouter, OpenAI, Anthropic, DeepSeek, z.ai/GLM, Kimi, MiniMax, and any OpenAI-compatible endpoint. For local inference, use Ollama, vLLM, or SGLang by pointing the base URL at it.

For model selection, tiering by task saves money: use cheap models for high-frequency lightweight tasks, strong models for long-chain reasoning, and keep privacy-sensitive tasks on local models.

## 4. Connecting to Messaging Platforms

```bash
hermes gateway setup
```

Follow the prompts to choose a platform (Telegram, Discord, Slack, WhatsApp, Signal, Feishu, DingTalk, WeCom, etc.). The wizard will guide you through creating a bot, filling in the token, and getting the chat ID. Once configured, the same gateway process can connect to multiple platforms simultaneously and share the same memory and persona settings.

A few practical pitfalls:

- **Long polling vs webhook, choose one**: use long polling locally or behind NAT; use webhook when you have a public domain
- **Restrict trigger scope in group chats**: otherwise it will respond to every message, burning tokens and annoying people
- **Set up the allowlist first**: only you should be able to DM it

## 5. Scheduled Tasks and Parallelism

Built-in cron scheduler; describe tasks and delivery targets in natural language:

```bash
# 每天早上 8 点把日程摘要发到 Telegram
hermes cron add "每天早上8点发送当日日程摘要" --deliver telegram

# 每周五备份并汇报
hermes cron add "每周五17点执行服务器备份并汇报结果" --deliver slack

hermes cron list
hermes cron runs <job>     # 看历史执行记录
```

When a task fails, check `hermes cron doctor` and `hermes cron incidents`, and compare with `hermes cron status` to confirm the scheduler is running.

When you need to split parallel work, you can spawn isolated subagents to handle it separately; for multi-step pipelines, you can use `execute_code` to combine several tool calls into one programmatic execution, avoiding feeding context back at every step.

| Capability | Use case |
|---|---|
| cron | Daily reports, inspections, backups, scheduled scraping |
| subagent | Multiple independent investigations |
| execute_code | Deterministic workflows with repeated tool calls in loops |

## 6. Deployment Forms

### 6.1 VPS

```bash
# 装完直接以前台方式验证，再交给 systemd 或 tmux 常驻
hermes gateway start
```

A machine with 2 GB of memory is enough to run the gateway + a small number of cron jobs; browser automation requires extra memory.

### 6.2 Docker

```dockerfile
FROM python:3.12-slim
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
VOLUME ["/root/.hermes"]
WORKDIR /app
CMD ["hermes", "gateway", "start"]
```

```yaml
services:
  hermes:
    build: .
    volumes:
      - hermes-data:/root/.hermes
    restart: always
volumes:
  hermes-data:
```

All data lands in `/root/.hermes`; recreating the container does not lose memory or skills; to pass in API keys, use environment variables or mount a config, and do not write them into the image layer.

### 6.3 Other Backends

| Backend | Purpose |
|---|---|
| Local | Run directly on a laptop/desktop, simplest |
| SSH | Gateway on the local machine, commands execute on the remote machine |
| Singularity | HPC clusters |
| Modal / Daytona | Serverless with idle sleep and on-demand wake |
| Vercel Sandbox | Cloud development environment |

## 7. Cost

The software itself is free; costs are in models and hosting:

| Item | Monthly cost |
|---|---|
| Local run / own host | $0 |
| Basic VPS | about $5 |
| Serverless (idle sleep) | close to $0 |
| API pay-as-you-go (DeepSeek, GLM, etc.) | $1-20 |
| Mostly high-end models | $20-100+ |

Three ways to reduce costs: tier model selection by task, put inference that can run locally on local, and set cron job frequency according to actual needs, not minute-level polling.

## 8. Security Boundary

It executes real commands under your account; assess risk under this premise:

- **Command approval**: dangerous operations (deletion, writing to sensitive paths, privilege escalation) require confirmation by default; allowlists can reduce repeated confirmations
- **Container isolation**: put uncertain automation in containers, mount only the directories needed
- **Least-privilege credentials**: use separate least-privilege credentials for API keys and SSH keys; don't reuse your main account
- **Auditing**: regularly review session history and cron execution records to confirm there are no out-of-bounds actions

## 9. Common Issues Reference

| Symptom | Common cause |
|---|---|
| `hermes` not found after installation | Shell not reloaded, PATH not updated |
| Chat reports 401 / 404 | API key or base URL misconfigured; `hermes status` can confirm |
| Gateway receives no messages | Wrong choice between long polling and webhook mode, or platform token expired |
| cron does not execute | Scheduler not started; check `hermes cron status` |
| Context keeps growing | Long task not converging; switch to subagent or `execute_code` segmentation |
| Replies truncated on mobile | Platform per-message length limit; send long output as a file |

## References

- [Hermes Agent official documentation](https://hermes-agent.nousresearch.com/docs)
- [Hermes Agent official website](https://hermes-agent.nousresearch.com)
- [GitHub repository](https://github.com/NousResearch/hermes-agent)
- [Nous Research](https://nousresearch.com)