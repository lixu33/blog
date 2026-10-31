---
isTimeLine: true
title: "Hermes Agent: Self-Hostable Open-Source AI Agent"
description: Hermes Agent is an MIT-licensed agent open-sourced by Nous Research that captures task processes as reusable skill files and stays online long-term within a messaging gateway. It covers memory and retrieval, cron scheduling, sub-agents, and other mechanisms, plus installation, model configuration, platform integration, Docker and VPS deployment steps, and cost estimates.
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
      content: Hermes Agent,AI Agents,AI Agent,Open Source AI,Self-Evolution,Persistent memory,Skills,Automation,Nous Research,Messaging bot,Self-hosted,Message Gateway,cron
translatedFrom: f3e8984b774bd2fe
---
# Hermes Agent: A Self-Hosted Open-Source AI Agent

If you want to run an assistant on a server that can proactively send messages, execute commands, and still remember what you talked about last month, the usual approach is to assemble your own bot framework and then bolt on scheduled tasks, logging, and a memory store—getting more fragmented with each addition. Hermes Agent (by Nous Research, MIT licensed) pulls these components into a single process: the messaging gateway connects to platforms, the model layer can switch providers, the tool layer performs real actions, and skills and memory are persisted to disk.

The following sections cover, in order: components, installation, model and platform configuration, scheduling and parallelism, deployment options, cost, and security boundaries.

## Three Things to Remember First

1. **One gateway process + one data directory (`~/.hermes`)** is the entire state; backup and migration only require moving this directory
2. **Models and platforms are only configuration items**; use `hermes model` to switch models and `hermes gateway setup` to connect platforms, with no code changes
3. **You must define the permission boundaries yourself**; it can execute shell commands and read/write files. Run it first on a separate machine or in a container, then move it to a host with data

## 1. What It Is

Hermes Agent is a self-hosted agent runtime that can run locally, on a VPS, in Docker, on an SSH target machine, or in a Serverless sandbox. Its differences from web-based chat products come down to three areas:

- **State persists beyond conversations**: conversation history, extracted preferences, and task results are written to local storage and can be recalled across conversations
- **It has tools**: terminal commands, file reads/writes, browser operations, web scraping, and code execution all run in the same reasoning loop
- **Processes can be codified**: after completing a complex task, you can turn the steps into a `SKILL.md` skill and execute it directly next time

| Component | Responsibility |
|---|---|
| Gateway | Connects to messaging platforms, maintains conversations and delivery |
| Model layer | Calls the selected provider, supports switching and fallback |
| Tool layer | Performs real actions such as terminal, files, browser, and search |
| Memory | Conversation storage, full-text search, user profile |
| Skill library | Directory of `SKILL.md` files loaded on demand |
| Scheduler | cron jobs; delivers results to specified platforms |

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

macOS and Windows also have desktop installers that include both a CLI and a graphical interface.

After installation, do only one thing first: get a clean conversation working.

```bash
hermes setup    # 交互式向导：选供应商、填 API Key
hermes          # 进入对话
```

If `hermes` won't start or a conversation throws an error, check `hermes doctor` first; don't rush to add gateway, cron, or plugins. The smaller the troubleshooting surface, the easier it is to isolate the problem.

## 3. Model Configuration

Models are configuration items, not hard bindings. `hermes model` lets you interactively choose a provider and model; you can also use `-m` / `--provider` to specify them for a single invocation:

```bash
hermes -m <model> --provider <provider>
hermes status           # 看当前模型、provider、各部件状态
hermes fallback         # 主模型失败时的备用供应商
```

Supported providers include Nous Portal, OpenRouter, OpenAI, Anthropic, DeepSeek, z.ai/GLM, Kimi, MiniMax, and any OpenAI-compatible endpoint. For local inference, use Ollama, vLLM, or SGLang by pointing the base URL at them.

For model selection, tiering by task saves money: use cheaper models for high-frequency lightweight tasks, stronger models for long-chain reasoning, and keep privacy-sensitive tasks on local models.

## 4. Connecting Messaging Platforms

```bash
hermes gateway setup
```

Choose a platform when prompted (Telegram, Discord, Slack, WhatsApp, Signal, Feishu, DingTalk, WeCom, etc.); the wizard guides you through creating a bot, entering the token, and obtaining the chat ID. Once configured, the same gateway process can connect to multiple platforms simultaneously and share the same memory and persona settings.

A few practical pitfalls:

- **Choose either long polling or webhook**: use long polling when local or behind NAT; use webhook only when you have a public domain
- **Limit triggering in group chats**: otherwise it will respond to every message, burning tokens and creating noise
- **Configure the allowlist first**: only you should be able to DM it

## 5. Scheduled Tasks and Parallelism

There is a built-in cron scheduler; describe the task and delivery target in natural language:

```bash
# 每天早上 8 点把日程摘要发到 Telegram
hermes cron add "每天早上8点发送当日日程摘要" --deliver telegram

# 每周五备份并汇报
hermes cron add "每周五17点执行服务器备份并汇报结果" --deliver slack

hermes cron list
hermes cron runs <job>     # 看历史执行记录
```

When a job fails, check `hermes cron doctor` and `hermes cron incidents`, and compare with `hermes cron status` to confirm the scheduler is running.

When work needs to be split in parallel, you can spawn isolated subagents to handle each part; for multi-step pipelines, `execute_code` can combine several tool calls into one programmatic execution, avoiding feeding context back at every step.

| Capability | Use Case |
|---|---|
| cron | Daily reports, inspections, backups, scheduled scraping |
| subagent | Multiple independent investigations |
| execute_code | Deterministic workflows with repeated tool calls |

## 6. Deployment Options

### 6.1 VPS

```bash
# 装完直接以前台方式验证，再交给 systemd 或 tmux 常驻
hermes gateway start
```

A machine with 2 GB of memory is enough to run the gateway plus a small number of cron jobs; browser automation requires extra memory.

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

All data is stored under `/root/.hermes`, so rebuilding the container does not lose memory or skills. To pass in API keys, use environment variables or mount the config; do not write them into image layers.

### 6.3 Other Backends

| Backend | Purpose |
|---|---|
| Local | Run directly on a laptop/desktop; simplest option |
| SSH | Gateway runs locally; commands execute on remote machines |
| Singularity | HPC clusters |
| Modal / Daytona | Serverless that sleeps when idle and wakes on demand |
| Vercel Sandbox | Cloud development environment |

## 7. Cost

The software itself is free; costs come from models and hosting:

| Item | Monthly Cost |
|---|---|
| Local run / self-provided host | $0 |
| Basic VPS | About $5 |
| Serverless (sleeps when idle) | Close to $0 |
| Pay-as-you-go API (DeepSeek, GLM, etc.) | $1-20 |
| Primarily high-end models | $20-100+ |

Three ways to reduce costs: tier model selection by task, run inference locally whenever possible, and set cron job frequency according to actual needs—avoid minute-level polling.

## 8. Security Boundaries

It executes real commands under your account, so assess risk with that premise:

- **Command approval**: dangerous operations (deletion, writing to sensitive paths, privilege escalation) require confirmation by default; an allowlist can reduce repeated confirmations
- **Container isolation**: put uncertain automation in containers, mounting only the directories it needs
- **Least-privilege credentials**: use separate credentials with minimal permissions for API keys and SSH keys; do not reuse your primary account
- **Auditing**: regularly review conversation history and cron execution records to confirm there are no out-of-bounds actions

## 9. Common Issues Reference

| Symptom | Common Cause |
|---|---|
| `hermes` not found after installation | Shell not reloaded; PATH not updated |
| Conversation returns 401 / 404 | Incorrect API key or base URL; verify with `hermes status` |
| Gateway receives no messages | Wrong long polling vs. webhook mode, or expired platform token |
| cron does not run | Scheduler not started; check with `hermes cron status` |
| Context keeps growing | Long task not converging; switch to subagents or use `execute_code` to segment it |
| Replies truncated on mobile | Platform per-message length limit; send long output as a file |

## Related Reading

- [OpenClaw Open-Source AI Assistant Deployment Guide](/en/ai/openclaw): another implementation of a similar self-hosted assistant
- [AI Agent Skills Primer: From Concepts to Runnable Skill Packages](/en/ai/agentSkills): add reusable skills to agents

## References

- [Hermes Agent Official Documentation](https://hermes-agent.nousresearch.com/docs)
- [Hermes Agent Official Website](https://hermes-agent.nousresearch.com)
- [GitHub Repository](https://github.com/NousResearch/hermes-agent)
- [Nous Research](https://nousresearch.com)