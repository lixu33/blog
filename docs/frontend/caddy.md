---
isTimeLine: true
title: Caddy 入门使用
description: Caddy 是一个强大的、易于使用的开源 Web 服务器，以其自动 HTTPS 功能而闻名。
date: 2024-05-15
tags:
 - 后端
 - Web服务器
categories:
 - Caddy
head:
  - - meta
    - name: keywords
      content: Caddy, Web服务器, 反向代理

---

# Caddy 入门使用

Caddy 是一个强大的、易于使用的开源 Web 服务器，以其自动 HTTPS 功能而闻名。本指南将带你了解 Caddy 的基本用法，从安装到配置。

## 安装 Caddy

你可以从 Caddy 的官方网站 [https://caddyserver.com/](https://caddyserver.com/) 下载适合你操作系统的二进制文件。安装过程非常简单，只需将二进制文件添加到你的系统路径即可。

## Caddyfile 配置

Caddy 使用名为 `Caddyfile` 的配置文件来定义服务器的行为。以下是一个简单的 `Caddyfile` 示例：

```
example.com {
  root * /var/www/example.com
  file_server
}
```

这个配置文件将 `example.com` 域名指向 `/var/www/example.com` 目录，并启用文件服务器功能。

## 启动 Caddy

启动 Caddy 服务器非常简单，只需在终端中运行 `caddy run` 命令即可。Caddy 会自动读取 `Caddyfile` 并启动服务器。

## 自动 HTTPS

Caddy 的一大亮点是其自动 HTTPS 功能。默认情况下，Caddy 会自动为你的域名申请和配置 SSL/TLS 证书，让你无需手动操作。

## 反向代理

Caddy 也可以用作反向代理服务器。以下是一个将请求代理到本地服务器的 `Caddyfile` 示例：

```
reverse_proxy localhost:8080 {
}
```

## 更多功能

Caddy 还提供了许多其他功能，例如：

* 负载均衡
* Gzip 压缩
* HTTP/2 支持
* WebSockets 支持

## 总结

Caddy 是一个功能强大且易于使用的 Web 服务器，非常适合各种应用场景。希望本指南能帮助你快速入门 Caddy，并开始构建你的 Web 应用。

## 目录结构

```
├── Caddyfile
└── /var/www/example.com
    └── index.html
```

1.  `Caddyfile` 是 Caddy 服务器的配置文件，用于定义服务器的行为。
2.  `/var/www/example.com` 是网站根目录，存放网站文件。
3.  `index.html` 是网站首页文件。

##  参考

*   Caddy 官方网站: [https://caddyserver.com/](https://caddyserver.com/)

