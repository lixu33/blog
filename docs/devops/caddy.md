---
isTimeLine: true
title: Caddy 入门：自动 HTTPS 与反向代理
description: Caddy v2 的安装、Caddyfile 基本语法与反向代理配置。重点说明自动 HTTPS 的触发条件、为什么不需要写 tls 指令、rate_limit 为什么会在启动时报错，以及 validate/reload 的正确用法。
date: 2024-05-15
updated: 2026-10-31
tags:
- Web服务器
- Caddy
- HTTPS
- 反向代理
categories:
- DevOps 运维
- DevOps
- Caddy
head:
- - meta
  - name: keywords
    content: Caddy, Caddyfile, 自动 HTTPS, 反向代理, caddy validate, caddy reload, encode gzip
---

Caddy 默认会自动申请和续期证书，域名配好就能用。前提是 80/443 能从公网访问，且需要的模块确实编译进了二进制——这两点决定了照着教程操作会不会卡住。

## Caddy 与其他 Web 服务器的差别在哪

Caddy 用 Go 编写，和 Nginx/Apache 最大的区别是**默认行为**：

- 域名配置好后自动申请并续期证书，不需要额外写任何 TLS 指令
- 配置文件是 Caddyfile（也有 JSON 原生格式），几十行就能表达常见需求
- 单个二进制，插件在编译时选定（这点和 Nginx 的模块化思路不同，会带来「指令存在但不可用」的问题，见 6.3）

代价：插件必须自定义编译，`xcaddy build` 是常用操作。

## 一、安装

**Debian/Ubuntu（官方源，推荐）**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

**macOS**

```bash
brew install caddy
```

**从源码构建（需要额外插件时）**

```bash
go install github.com/caddyserver/caddy/v2/cmd/caddy@latest
# 或者用 xcaddy 打插件
xcaddy build --with github.com/caddyserver/ratelimit
```

注意 `go get` 的旧写法在 Go 1.17 之后不再用于安装可执行文件，`go install ...@version` 才是当前方式。

## 二、Caddyfile 最小示例

```caddyfile
example.com {
    root * /var/www/example.com
    file_server
}
```

三件事：匹配域名、设置根目录、开启静态文件服务。

`*` 在这里表示「匹配所有请求」，是路径匹配器，不是通配域名。

## 三、自动 HTTPS：什么时候会触发

**不需要写 `tls` 指令。** 只要 Caddyfile 里出现的是一个域名（且 80/443 可从公网访问），Caddy 就会：

1. 向 Let's Encrypt 或 ZeroSSL 申请证书（ACME）
2. 自动完成 HTTP-01 或 TLS-ALPN-01 校验
3. 到期前自动续期

常见导致自动 HTTPS 失败的情况：

| 现象 | 原因 |
|---|---|
| 一直卡在 `obtaining certificate` | 80/443 被防火墙或云安全组挡住 |
| 申请成功但浏览器报证书错误 | 域名解析没指向本机，或中间有 CDN 回源配置错误 |
| 内网域名申请失败 | 内网域名无法完成 ACME 校验，需要 DNS-01 挑战或自签证书 |

自定义证书（内网、已有证书）才需要 `tls`：

```caddyfile
internal.example.com {
    tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
    root * /var/www
    file_server
}
```

本地/内网想用 Caddy 自签：

```caddyfile
{
    local_certs
}
```

## 四、反向代理

```caddyfile
example.com {
    reverse_proxy localhost:8080
}
```

多后端 + 负载均衡策略：

```caddyfile
example.com {
    reverse_proxy 10.0.0.1:8080 10.0.0.2:8080 {
        lb_policy round_robin   # 可选 least_conn / ip_hash / random / first
        health_uri /health
        health_interval 10s
    }
}
```

反向代理的几个实用点：

- 自动透传 `X-Forwarded-For`、`X-Forwarded-Proto`，后端拿真实 IP 不用额外配置
- WebSocket 自动支持，无需 `Upgrade` 头处理
- 上游是 HTTPS 时用 `reverse_proxy https://backend:8443`，自签证书加 `transport http { tls_insecure_skip_verify }`（仅测试环境）

## 五、路由与中间件

Caddy 的指令按固定顺序执行（`encode` → `reverse_proxy` 等有内建顺序），要强制自定义顺序时用 `route`：

```caddyfile
example.com {
    route /api/* {
        reverse_proxy localhost:8080
    }
    route {
        root * /var/www/example.com
        file_server
    }
}
```

### 5.1 压缩

`gzip` 指令在 v2 里已被 `encode` 取代：

```caddyfile
example.com {
    encode zstd gzip
    root * /var/www
    file_server
}
```

### 5.2 常见中间件

```caddyfile
example.com {
    # 安全响应头
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        -Server
    }

    # 访问日志（JSON 行格式）
    log {
        output file /var/log/caddy/access.log {
            roll_size 50mb
            roll_keep 5
        }
    }

    # 静态压缩文件优先
    root * /var/www
    file_server {
        precompressed zstd gzip
    }
}
```

### 5.3 `rate_limit` 不是内置指令

直接写 `rate_limit` 会得到：

```
Error: adapting config using caddyfile: unrecognized directive: rate_limit
```

它来自第三方插件 `github.com/mholt/caddy-ratelimit`，必须用 `xcaddy build --with github.com/mholt/caddy-ratelimit` 重新编译。这是「教程能跑、我的机器报错」最常见的原因——Caddy 的指令集取决于编译时选了哪些模块，`caddy list-modules` 可以列出当前二进制实际有什么。

## 六、运维要点

### 6.1 先验证再重载

```bash
caddy validate --config /etc/caddy/Caddyfile   # 只校验，不生效
sudo systemctl reload caddy                    # 平滑重载，不断连接
```

修改配置后直接 `restart` 会中断连接；`reload` 是零停机的方式。`validate` 能在重载前抓出语法错误，避免服务起不来。

### 6.2 格式化

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### 6.3 查当前二进制支持哪些指令

```bash
caddy list-modules | grep -i ratelimit
```

排查「指令不认」时，先确认模块是否存在，再怀疑语法。

### 6.4 管理 API

Caddy 在 `localhost:2019` 暴露配置 API，`caddy reload` 实际就是向它 POST 配置：

```bash
curl localhost:2019/config/          # 查看当前生效配置
curl localhost:2019/metrics          # Prometheus 指标
```

这条路径也是容器化部署时做动态配置的入口。

## 七、典型用法

- **静态站点 / 博客**：`root` + `file_server`，证书全自动
- **反向代理**：把内网服务（面板、API、数据库管理界面）暴露到域名，省掉单独的 Nginx
- **本地开发**：`caddy file-server --browse` 一行起服务，或 `caddy reverse-proxy --from :80 --to :3000`
- **多站点共存**：多个域名块写在同一 Caddyfile，证书各自独立申请

## 参考

- [Caddy 官方文档](https://caddyserver.com/docs/)
- [Caddyfile 指令参考](https://caddyserver.com/docs/caddyfile/directives)
- [自动 HTTPS 说明](https://caddyserver.com/docs/automatic-https)
- [caddy-ratelimit 插件](https://github.com/mholt/caddy-ratelimit)
