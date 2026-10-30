---
isTimeLine: true
title: "Getting Started with Caddy: Automatic HTTPS and Reverse Proxy"
description: Caddy v2 installation, basic Caddyfile syntax, and reverse proxy configuration. Focuses on automatic HTTPS trigger conditions, why the tls directive is unnecessary, why rate_limit errors at startup, and correct usage of validate/reload.
date: 2024-05-15
updated: 2026-10-31
tags:
- Web server
- Caddy
- HTTPS
- reverse proxy
categories:
- DevOps Operations
- DevOps
- Caddy
head:
- - meta
  - name: keywords
    content: Caddy,Caddyfile,Automatic HTTPS,Reverse proxy,caddy validate,caddy reload,encode gzip
translatedFrom: 41aa11810fa810bd
---
Caddy automatically obtains and renews certificates by default — once your domain is configured, it just works. The prerequisites are that ports 80/443 are reachable from the public internet and that the required modules are actually compiled into the binary — these two points determine whether following a tutorial will get you stuck.

## How Caddy Differs from Other Web Servers

Caddy is written in Go, and its biggest difference from Nginx/Apache is its **default behavior**:

- Once a domain is configured, certificates are obtained and renewed automatically — no extra TLS directives required
- Configuration lives in a Caddyfile (a native JSON format also exists); a few dozen lines cover common needs
- A single binary, with plugins selected at compile time (this differs from Nginx's modular approach and leads to the "directive exists but is unavailable" problem — see 6.3)

The trade-off: plugins require a custom build, so `xcaddy build` is a common operation.

## 1. Installation

**Debian/Ubuntu (official repository, recommended)**

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

**Building from source (when you need extra plugins)**

```bash
go install github.com/caddyserver/caddy/v2/cmd/caddy@latest
# 或者用 xcaddy 打插件
xcaddy build --with github.com/caddyserver/ratelimit
```

Note that the old `go get` form has not been used to install executables since Go 1.17; `go install ...@version` is the current approach.

## 2. Minimal Caddyfile Example

```caddyfile
example.com {
    root * /var/www/example.com
    file_server
}
```

Three things: match the domain, set the root directory, and enable static file serving.

`*` here means "match all requests" — it's a path matcher, not a wildcard domain.

## 3. Automatic HTTPS: When It Kicks In

**You don't need to write a `tls` directive.** As long as what appears in the Caddyfile is a domain (and 80/443 are reachable from the public internet), Caddy will:

1. Request a certificate from Let's Encrypt or ZeroSSL (ACME)
2. Complete HTTP-01 or TLS-ALPN-01 validation automatically
3. Renew automatically before expiry

Common causes of automatic HTTPS failure:

| Symptom | Cause |
|---|---|
| Stuck on `obtaining certificate` | 80/443 blocked by a firewall or cloud security group |
| Certificate issued but the browser reports a certificate error | DNS doesn't point to this machine, or the CDN origin configuration in between is wrong |
| Intranet domain fails to obtain a certificate | Intranet domains can't complete ACME validation; use a DNS-01 challenge or a self-signed certificate |

You only need `tls` for custom certificates (intranet, or certificates you already have):

```caddyfile
internal.example.com {
    tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
    root * /var/www
    file_server
}
```

To have Caddy self-sign for local/intranet use:

```caddyfile
{
    local_certs
}
```

## 4. Reverse Proxy

```caddyfile
example.com {
    reverse_proxy localhost:8080
}
```

Multiple backends + load balancing policy:

```caddyfile
example.com {
    reverse_proxy 10.0.0.1:8080 10.0.0.2:8080 {
        lb_policy round_robin   # 可选 least_conn / ip_hash / random / first
        health_uri /health
        health_interval 10s
    }
}
```

A few practical points about reverse proxying:

- `X-Forwarded-For` and `X-Forwarded-Proto` are passed through automatically; backends get the real IP with no extra configuration
- WebSocket is supported automatically — no `Upgrade` header handling needed
- When the upstream is HTTPS, use `reverse_proxy https://backend:8443`; for self-signed certificates add `transport http { tls_insecure_skip_verify }` (test environments only)

## 5. Routing and Middleware

Caddy executes directives in a fixed order (`encode` → `reverse_proxy` and so on have a built-in order); use `route` when you need to force a custom order:

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

### 5.1 Compression

The `gzip` directive was replaced by `encode` in v2:

```caddyfile
example.com {
    encode zstd gzip
    root * /var/www
    file_server
}
```

### 5.2 Common Middleware

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

### 5.3 `rate_limit` Is Not a Built-in Directive

Writing `rate_limit` directly gets you:

```
Error: adapting config using caddyfile: unrecognized directive: rate_limit
```

It comes from the third-party plugin `github.com/mholt/caddy-ratelimit` and requires rebuilding with `xcaddy build --with github.com/mholt/caddy-ratelimit`. This is the most common cause of "it works in the tutorial but errors on my machine" — Caddy's directive set depends on which modules were selected at compile time, and `caddy list-modules` lists what the current binary actually has.

## 6. Operational Essentials

### 6.1 Validate Before Reloading

```bash
caddy validate --config /etc/caddy/Caddyfile   # 只校验，不生效
sudo systemctl reload caddy                    # 平滑重载，不断连接
```

Running `restart` directly after changing the configuration drops connections; `reload` is the zero-downtime way. `validate` catches syntax errors before a reload, so the service doesn't fail to start.

### 6.2 Formatting

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### 6.3 Checking Which Directives the Current Binary Supports

```bash
caddy list-modules | grep -i ratelimit
```

When debugging "directive not recognized", first confirm the module exists, then suspect the syntax.

### 6.4 Admin API

Caddy exposes a configuration API on `localhost:2019`; `caddy reload` actually POSTs the configuration to it:

```bash
curl localhost:2019/config/          # 查看当前生效配置
curl localhost:2019/metrics          # Prometheus 指标
```

This endpoint is also the entry point for dynamic configuration in containerized deployments.

## 7. Typical Uses

- **Static sites / blogs**: `root` + `file_server`, with fully automatic certificates
- **Reverse proxy**: expose intranet services (admin panels, APIs, database management UIs) on a domain and skip a separate Nginx
- **Local development**: start a server with one line — `caddy file-server --browse` — or `caddy reverse-proxy --from :80 --to :3000`
- **Multiple sites side by side**: put several domain blocks in the same Caddyfile, each obtaining its own certificate

## References

- [Caddy official documentation](https://caddyserver.com/docs/)
- [Caddyfile directive reference](https://caddyserver.com/docs/caddyfile/directives)
- [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [caddy-ratelimit plugin](https://github.com/mholt/caddy-ratelimit)