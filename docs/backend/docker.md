---
isTimeLine: true
title: Docker 总结
date: 2024-05-17
tags:
 - Docker
 - 容器
 - DevOps
categories:
 - Docker
keywords: Docker, 容器, 镜像, Dockerfile
---

# Docker 总结

Docker 是一款开源的应用容器引擎，可以让开发者将应用程序及其依赖打包到一个可移植的容器中，然后发布到任何流行的 Linux 机器上，也可以实现虚拟化。容器是完全使用沙箱机制，相互之间不会有任何接口（类似 iPhone 的 app）。

## 1. Docker 的原理

Docker 基于 Linux 容器（Linux Containers，LXC）技术实现。容器是一种轻量级的虚拟化技术，它允许在单个控制主机上运行多个隔离的用户空间实例（称为容器）。与虚拟机不同，容器不需要模拟整个操作系统，而是共享宿主机的内核。

**Docker 的核心组件包括:**

* **Docker 镜像 (Image):**  Docker 镜像是一个只读模板，包含了运行应用程序所需的所有文件系统、库、环境变量和配置。
* **Docker 容器 (Container):**  Docker 容器是 Docker 镜像的运行实例。容器是隔离的、可移植的，并且可以在任何支持 Docker 的平台上运行。
* **Docker 守护进程 (Daemon):**  Docker 守护进程是一个后台运行的进程，负责管理 Docker 镜像、容器和其他 Docker 资源。
* **Docker 客户端 (Client):**  Docker 客户端是一个命令行工具，用于与 Docker 守护进程进行交互。

## 2. Docker 基础指令

以下是 Docker 常用的一些基础指令：

* `docker version`:  查看 Docker 客户端和守护进程的版本信息。
* `docker search`:  在 Docker Hub 上搜索 Docker 镜像。
* `docker pull`:  从 Docker Hub 下载 Docker 镜像。
* `docker images`:  列出本地已下载的 Docker 镜像。
* `docker run`:  创建一个新的 Docker 容器并运行。
* `docker ps`:  列出正在运行的 Docker 容器。
* `docker stop`:  停止一个正在运行的 Docker 容器。
* `docker restart`:  重启一个 Docker 容器。
* `docker kill`:  强制停止一个正在运行的 Docker 容器。
* `docker rm`:  删除一个 Docker 容器。
* `docker rmi`:  删除一个 Docker 镜像。
* `docker build`:  使用 Dockerfile 构建一个新的 Docker 镜像。
* `docker exec`:  在一个运行的 Docker 容器中执行命令。
* `docker logs`:  查看一个 Docker 容器的日志。

## 3. Dockerfile 示例

Dockerfile 是一个文本文件，包含了构建 Docker 镜像的指令。以下是一个简单的 Dockerfile 示例，用于构建一个运行 Node.js 应用的镜像：

```dockerfile
# 使用 Node.js 16 作为基础镜像
FROM node:16

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json 文件到工作目录
COPY package*.json ./

# 安装应用程序依赖
RUN npm install

# 复制应用程序代码到工作目录
COPY . .

# 暴露应用程序端口
EXPOSE 3000

# 定义启动命令
CMD ["npm", "start"]
```

**解释:**

1. `FROM node:16`: 指定基础镜像为 Node.js 16 版本。
2. `WORKDIR /app`: 设置工作目录为 `/app`。
3. `COPY package*.json ./`: 将 `package.json` 和 `package-lock.json` 文件复制到工作目录。
4. `RUN npm install`: 在容器中安装应用程序依赖。
5. `COPY . .`: 将当前目录下的所有文件复制到容器的工作目录。
6. `EXPOSE 3000`: 暴露容器的 3000 端口，用于访问 Node.js 应用。
7. `CMD ["npm", "start"]`: 定义容器启动时执行的命令，这里使用 `npm start` 启动 Node.js 应用。

## 4. 总结

Docker 是一个强大的工具，可以简化应用程序的开发、部署和管理。通过使用 Docker，开发者可以将应用程序及其依赖打包到一个可移植的容器中，并轻松地在不同的环境中运行。


## 5. 参考

* [Docker 官方文档](https://docs.docker.com/)


