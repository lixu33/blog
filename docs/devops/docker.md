---
isTimeLine: true
sticky: 4
title: Docker 从入门到实践
description: 讲清镜像分层结构、构建缓存按指令逐条失效的规则、namespace 与 cgroup 各自提供的隔离边界、端口映射与数据卷的两种挂法、多阶段构建瘦身手段，以及容器启动即退出、端口访问不通、停止要等十秒才被强杀等故障的排查顺序，并给出实际排查中常见退出码的读法。
date: 2024-05-17
updated: 2026-10-31
tags:
- Docker
- DevOps
- 微服务
categories:
- DevOps 运维
- 容器化技术
head:
- - meta
  - name: keywords
    content: Docker, Dockerfile, 镜像分层, overlay2, namespace, cgroup, 数据卷, 多阶段构建
---

# Docker 从入门到实践

同一份代码在开发机上跑得好好的，上了服务器因为 glibc 或 Node 版本不一致启动失败；镜像推到仓库 1.2 GB，每次发布拉取都要几分钟；容器重启一次，写在里面的数据全没了。这三类问题分别对应镜像怎么构建、容器怎么运行、数据放在哪。

下面按隔离机制、镜像分层、常用命令、Dockerfile 写法、运行与持久化、瘦身、排查的顺序展开，命令都以 Linux 上的 Docker Engine 为准。

## 先记住四件事

1. **镜像是一组只读层，容器是镜像 + 一层可写层**。可写层随容器删除一起消失，需要保留的数据必须挂卷。
2. **容器是一个普通 Linux 进程**，隔离靠 namespace，资源限额靠 cgroup，没有自己的内核。
3. **构建缓存按指令逐条失效**：某条指令的文本或它 `COPY` 进来的文件变了，这条及之后所有层的缓存都作废。
4. **容器随 PID 1 退出而退出**，`docker run -d` 只是把进程放到后台，不等于常驻。

## 一、容器隔离了什么

早期 Docker（0.9 之前）直接用 LXC 管理容器，之后换成自己实现的 libcontainer；2015 年这部分捐给 OCI，演化为 runc。现在的调用链是：

```text
docker CLI → dockerd → containerd → containerd-shim → runc → 容器进程
```

runc 只按 OCI 规范创建进程、配好 namespace 和 cgroup，创建完就退出，容器进程由 shim 托管。所以「Docker 基于 LXC」是过时说法，LXC 只在 0.9 之前的版本里作为容器驱动。

namespace 决定看得见什么：

| namespace | 隔离内容 |
|---|---|
| PID | 进程号，容器内看到自己的 1 号进程 |
| NET | 网卡、IP、端口、路由表 |
| MNT | 挂载点与文件系统视图 |
| UTS | 主机名与域名 |
| IPC | 信号量、消息队列 |
| USER | 用户与 UID 映射 |

cgroup 决定能用多少：

```bash
docker run -d --memory 512m --memory-swap 512m --cpus 1.5 nginx
```

注意 `--memory-swap` 不设时默认是 `--memory` 的两倍，想彻底禁用 swap 就得两者设成同一个值。cgroup v2 下这些限制由 systemd 的 `docker-<id>.scope` 统一管理，`docker stats` 读的就是它的数字。

namespace 和 cgroup 都是内核特性，所以 Linux 上原生运行；macOS 和 Windows 上的 Docker Desktop 实际跑在一个轻量虚拟机里，文件挂载和网络会有额外一层开销。

**PID 1 的特殊性**：容器里 1 号进程要负责回收僵尸进程、转发信号。应用自己不处理 `SIGTERM` 时，`docker stop` 会等 10 秒然后 `SIGKILL`，表现为「停止很慢」或「数据没来得及落盘」。加 `--init` 让 tini 当 1 号进程即可。

## 二、镜像分层与构建缓存

镜像由若干只读层叠加，运行时在最上面再加一层可写层。默认存储驱动是 `overlay2`（底层文件系统为 ext4 或 xfs 时），读写通过写时复制完成：改一个文件会先把它从下层拷到可写层，再修改。

这带来两个直接后果：

- 同一基础镜像的多个镜像共享底层，磁盘和拉取流量都省
- 容器内大量写小文件时性能低于宿主机，数据库这类应用应把数据目录挂卷

构建缓存的失效规则值得单独记：

| 指令 | 缓存何时失效 |
|---|---|
| `COPY package*.json ./` | 只有这两个文件内容变了 |
| `RUN npm ci` | 上一条失效，或命令文本变了 |
| `COPY . .` | 任意源码改动 |

所以顺序是「先拷依赖清单 → 装依赖 → 再拷源码」。反过来写成先 `COPY . .` 再装依赖，改一行代码就要重装全部依赖。`.dockerignore` 同理——被忽略的文件变化不会触发缓存失效，也能避免把 `node_modules`、`.git` 塞进构建上下文拖慢上传。常见内容：

```text
node_modules
.git
dist
*.log
```

## 三、常用命令

| 命令 | 用途 |
|---|---|
| `docker pull` / `push` | 拉取、推送镜像 |
| `docker images` | 列出本地镜像 |
| `docker build -t name:tag .` | 用当前目录的 Dockerfile 构建 |
| `docker run` | 创建并启动容器 |
| `docker ps -a` | 列出容器（含已退出） |
| `docker logs -f --tail 100` | 跟踪日志 |
| `docker exec -it <id> sh` | 进入运行中的容器 |
| `docker inspect` | 查看完整配置与状态 |
| `docker stats` | 实时资源占用 |
| `docker rm` / `rmi` | 删除容器 / 镜像 |
| `docker system df` | 统计镜像、容器、卷占用 |
| `docker system prune` | 清理未使用的对象 |

`docker ps` 默认只显示运行中的容器，容器「启动就没了」时加 `-a` 才能看到退出码。

## 四、写 Dockerfile

以 Node.js 应用为例，用多阶段构建把依赖和运行时分开放：

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/app.js ./
USER node
EXPOSE 3000
CMD ["node", "app.js"]
```

要点：

1. `FROM node:24-slim` —— `slim` 比默认标签小得多且仍是 glibc，原生模块不用重新编译；`alpine` 用 musl，装了带预编译二进制包的依赖容易在运行时报找不到符号。
2. `npm ci` 严格按 `package-lock.json` 安装，可重复；`npm install` 可能改写 lock 文件，镜像因此不可复现。
3. `USER node` 切换为非 root，避免容器内默认以 root 运行，否则容器逃逸后影响范围会扩大到宿主机。
4. `EXPOSE 3000` 只是声明和文档作用，不做端口发布；真正对外要用 `-p`。
5. `CMD` 是默认命令，`docker run image sh` 这种在镜像名后追加的命令会**替换**它；`ENTRYPOINT` 则是固定的可执行文件，追加内容变成参数。
6. 一个 Dockerfile 里只有一个 `CMD` 生效，写多个时最后一个覆盖前面的。

## 五、运行容器：端口、数据、退出

```bash
docker run -d --name app \
  -p 8080:3000 \
  -v app-data:/app/data \
  -e NODE_ENV=production \
  --restart unless-stopped \
  my-node-app
```

- `-p 8080:3000` 是「宿主机端口:容器端口」。不写宿主机 IP 时监听 `0.0.0.0`，写成 `-p 127.0.0.1:8080:3000` 则只对本机开放。
- 端口通了但仍访问不到，先查应用是否绑在 `127.0.0.1` 而不是 `0.0.0.0`——容器内的回环地址和宿主机不是同一个。

数据有两种挂法：

| 类型 | 写法 | 适用 |
|---|---|---|
| 命名卷 | `-v app-data:/app/data` | 数据库、需要备份的持久数据 |
| 绑定挂载 | `-v $(pwd)/data:/app/data` | 开发时改代码即时生效 |

命名卷由 Docker 管理，位置在 `/var/lib/docker/volumes/`，删容器不会删卷，要显式 `docker volume rm`。绑定挂载直接映射宿主机目录，权限和 SELinux 标签问题更多（SELinux 下需要加 `:z`）。

容器退出的常见原因：

```bash
docker ps -a                    # 看 STATUS 里的退出码
docker logs <id>                # 前台输出，应用崩溃的堆栈在这里
docker inspect <id> --format '{{.State.ExitCode}} {{.State.OOMKilled}}'
```

退出码 `137` 基本是收到 `SIGKILL`，配合 `OOMKilled=true` 就是撞了内存上限。

## 六、镜像瘦身

| 手段 | 效果 |
|---|---|
| 换 `slim` 基础镜像 | 通常省几百 MB |
| 多阶段构建 | 构建工具链不进最终镜像 |
| 合并 `RUN` 并清理包缓存 | 少一层，`apt` 缓存不残留 |
| `.dockerignore` | 缩小构建上下文 |

Debian 系基础镜像里装包时写成一条：

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

分开写 `apt-get update` 和 `apt-get install` 会让缓存层留下过期的包索引。

查看每层占多大用 `docker history <image>`；要进一步定位具体文件，用 `dive` 这类工具。

## 七、排查对照

| 现象 | 常见原因 |
|---|---|
| 容器启动即退出 | 主进程报错，看 `docker logs`；`-d` 会吞掉前台输出 |
| `exec` 报容器未运行 | 容器已退出，`docker ps -a` 确认状态 |
| 端口访问不通 | 没写 `-p`，或应用绑在容器内 `127.0.0.1` |
| 构建时 `COPY` 找不到文件 | 被 `.dockerignore` 排除，或路径相对构建上下文 |
| 磁盘持续增长 | 悬空镜像和旧容器堆积，`docker system df` 看明细 |
| 中文乱码 / 时区错 | 精简镜像缺 `tzdata` 和 locale，需自行安装并设 `TZ` |
| 停止容器要等 10 秒 | 应用不处理 `SIGTERM`，加 `--init` 或补信号处理 |

## 参考

- [Docker 构建最佳实践](https://docs.docker.com/build/building/best-practices/)
- [Dockerfile 参考](https://docs.docker.com/reference/dockerfile/)
- [overlay2 存储驱动](https://docs.docker.com/engine/storage/drivers/overlay2/)
- [docker container run 命令参考](https://docs.docker.com/reference/cli/docker/container/run/)
