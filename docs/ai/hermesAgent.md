---
isTimeLine: true
title: Hermes Agent：可自托管的开源 AI 智能体
description: Hermes Agent 是 Nous Research 开源的 MIT 许可智能体，把任务过程沉淀为可复用的技能文件，在消息网关里长期在线。内容覆盖记忆与检索、cron 调度、子智能体等机制，以及安装、模型配置、平台接入、Docker 与 VPS 部署步骤和成本估算。
date: 2026-08-01
updated: 2026-10-31
tags:
- AI Agent
- 开源工具
- 自我进化
- 个人助理
categories:
- 人工智能
- AI
- 人工智能应用
head:
  - - meta
    - name: keywords
      content: Hermes Agent,AI智能体,AI Agent,开源AI,自我进化,持久记忆,Skills,自动化,Nous Research,消息机器人,自托管,消息网关,cron
---

# Hermes Agent：可自托管的开源 AI 智能体

想在服务器上挂一个能主动发消息、能跑命令、还记得上个月聊过什么的助理，常见做法是自己拼一个 Bot 框架，再配定时任务、日志和记忆库，越拼越散。Hermes Agent（Nous Research 出品，MIT 许可）把这几个部件收进一个进程：消息网关接平台，模型层可换供应商，工具层执行实际操作，技能和记忆落盘。

下面按组成部件、安装、模型与平台配置、调度与并行、部署形态、成本和安全边界的顺序展开。

## 先记住三件事

1. **一个网关进程 + 一份数据目录（`~/.hermes`）** 就是全部状态；备份和迁移只需要搬这个目录
2. **模型与平台都只是配置项**，`hermes model` 换模型，`hermes gateway setup` 接平台，代码不用动
3. **权限边界要自己划**，它能执行 shell、读写文件；先在独立机器或容器里跑，再放到有数据的主机

## 一、它是什么

Hermes Agent 是一个自托管的智能体运行时，可以跑在本地、VPS、Docker、SSH 目标机或 Serverless 沙箱上。与网页版对话产品的差别集中在三处：

- **会话之外有状态**：对话记录、提炼出的偏好、任务结果都写进本地存储，换会话还能召回
- **有工具**：终端命令、文件读写、浏览器操作、网页抓取、代码执行，都在同一个推理循环里
- **可沉淀流程**：完成一次复杂任务后，可以把步骤整理成 `SKILL.md` 技能，下次直接按技能执行

| 部件 | 职责 |
|---|---|
| Gateway | 接消息平台，维持会话与投递 |
| 模型层 | 调用所选供应商，支持切换与回退 |
| 工具层 | 终端、文件、浏览器、搜索等实际动作 |
| 记忆 | 会话存储、全文检索、用户画像 |
| 技能库 | 按需加载的 `SKILL.md` 目录 |
| 调度 | cron 任务，结果投递到指定平台 |

## 二、安装

Linux / macOS / WSL2 / Termux：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc   # 或 ~/.zshrc
```

Windows（PowerShell）：

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

macOS 和 Windows 也有桌面安装包，装完同时带 CLI 和图形界面。

装完先只做一件事：跑通一次干净对话。

```bash
hermes setup    # 交互式向导：选供应商、填 API Key
hermes          # 进入对话
```

如果 `hermes` 起不来或对话报错，先查 `hermes doctor`，不要急着叠加 gateway、cron、插件。排障面越小越好定位。

## 三、模型配置

模型是配置项，不是绑定关系。`hermes model` 交互式选择供应商和模型；也可以用 `-m` / `--provider` 在单次调用里指定：

```bash
hermes -m <model> --provider <provider>
hermes status           # 看当前模型、provider、各部件状态
hermes fallback         # 主模型失败时的备用供应商
```

支持的范围包括 Nous Portal、OpenRouter、OpenAI、Anthropic、DeepSeek、z.ai/GLM、Kimi、MiniMax，以及任意 OpenAI 兼容端点。本地推理走 Ollama、vLLM、SGLang，把 base URL 指过去即可。

选型上按任务分档比较省钱：高频轻任务用便宜模型，长链推理用强模型，隐私敏感的任务留在本地模型。

## 四、接入消息平台

```bash
hermes gateway setup
```

按提示选择平台（Telegram、Discord、Slack、WhatsApp、Signal、飞书、钉钉、企业微信等），向导会引导建 Bot、填 token、取 chat ID。配好后同一个网关进程可以同时接多个平台，共享同一份记忆和人格设定。

几个实际会踩的点：

- **长轮询与 webhook 二选一**：本地或 NAT 后面用长轮询，有公网域名再用 webhook
- **群聊要限制触发范围**：否则它会对每条消息响应，烧 token 也扰民
- **先把 allowlist 配好**：能私聊它的人应当只有你

## 五、定时任务与并行

内置 cron 调度器，用自然语言描述任务和投递目标：

```bash
# 每天早上 8 点把日程摘要发到 Telegram
hermes cron add "每天早上8点发送当日日程摘要" --deliver telegram

# 每周五备份并汇报
hermes cron add "每周五17点执行服务器备份并汇报结果" --deliver slack

hermes cron list
hermes cron runs <job>     # 看历史执行记录
```

任务失败时看 `hermes cron doctor` 和 `hermes cron incidents`，比对 `hermes cron status` 确认调度器在跑。

需要拆并行工作时，可以派生隔离子智能体（subagent）分别处理；多步骤的流水线可以用 `execute_code` 把若干工具调用合并成一次程序化执行，避免每一步都回灌上下文。

| 能力 | 适用场景 |
|---|---|
| cron | 日报、巡检、备份、定时抓取 |
| subagent | 互不依赖的多路调查 |
| execute_code | 循环多次工具调用的确定性流程 |

## 六、部署形态

### 6.1 VPS

```bash
# 装完直接以前台方式验证，再交给 systemd 或 tmux 常驻
hermes gateway start
```

2 GB 内存的机器足够跑网关 + 少量 cron；浏览器自动化要额外留内存。

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

数据全部落在 `/root/.hermes`，容器重建不丢记忆和技能；要把 API Key 传进去，用环境变量或挂载 config，不要写进镜像层。

### 6.3 其他后端

| 后端 | 用途 |
|---|---|
| 本地 | 笔记本/桌面直接跑，最省事 |
| SSH | 网关在本机、命令在远程机执行 |
| Singularity | HPC 集群 |
| Modal / Daytona | 空闲休眠、按需唤醒的 Serverless |
| Vercel Sandbox | 云端开发环境 |

## 七、成本

软件本身免费，开销在模型和托管：

| 项目 | 月成本 |
|---|---|
| 本地运行 / 自备主机 | $0 |
| 基础 VPS | 约 $5 |
| Serverless（闲置休眠） | 接近 $0 |
| API 按量（DeepSeek、GLM 等） | $1-20 |
| 高端模型为主 | $20-100+ |

降低开销的三个手段：按任务分级选模型、把能本地跑的推理放本地、cron 任务的频率按真实需要设，不要用分钟级轮询。

## 八、安全边界

它执行的是你账号下的真实命令，风险按这个前提评估：

- **命令审批**：危险操作（删除、写入敏感路径、提权）默认要确认，可以用 allowlist 减少重复确认
- **容器隔离**：不确定的自动化放进容器，挂载只给需要的目录
- **最小凭证**：API Key、SSH key 用最小权限的独立凭证，别复用主账号
- **审计**：定期看会话历史和 cron 执行记录，确认没有越界动作

## 九、常见问题对照

| 现象 | 常见原因 |
|---|---|
| 安装后 `hermes` 找不到 | 没重载 shell，PATH 未更新 |
| 对话报 401 / 404 | API Key 或 base URL 配错，`hermes status` 可确认 |
| 网关收不到消息 | 长轮询与 webhook 模式选错，或平台 token 过期 |
| cron 不执行 | 调度器未启动，`hermes cron status` 查看 |
| 上下文越用越大 | 长任务未收敛，改用 subagent 或 `execute_code` 分段 |
| 手机端回复被截断 | 平台单条消息长度限制，长输出改发文件 |

## 参考

- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com/docs)
- [Hermes Agent 官网](https://hermes-agent.nousresearch.com)
- [GitHub 仓库](https://github.com/NousResearch/hermes-agent)
- [Nous Research](https://nousresearch.com)
