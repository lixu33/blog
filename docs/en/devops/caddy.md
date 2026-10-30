---
isTimeLine: true
title: "Getting Started with Caddy: Automatic HTTPS and Reverse Proxy"
description: Caddy v2 installation, basic Caddyfile syntax, and reverse proxy configuration. Focuses on the trigger conditions for automatic HTTPS, why the tls directive is unnecessary, why rate_limit causes an error at startup, and the correct usage of validate/reload.
date: 2024-05-15
updated: 2026-10-31
tags:
- Web Server
- Caddy
- HTTPS
- Reverse proxy
categories:
- DevOps Operations
- DevOps
- Caddy
head:
- - meta
  - name: keywords
    content: Caddy,Caddyfile,Automatic HTTPS,Reverse proxy,caddy validate,caddy reload,encode gzip
translatedFrom: 91f2d5ce06a9d421
---
# Getting Started with Caddy: Automatic HTTPS and Reverse Proxy

Caddy automatically obtains and renews certificates by default, so it works once the domain is configured. The prerequisites are that ports 80/443 are reachable from the public internet and the required modules are actually compiled into the binary—these two points determine whether following the tutorial will get stuck.

## How Caddy differs from other web servers

Caddy is written in Go. The biggest difference from Nginx/Apache is its **default behavior**:

- Automatically obtains and renews certificates after the domain is configured; no extra TLS directives are needed
- The config file is the Caddyfile (native JSON format is also available); common requirements can be expressed in a few dozen lines
- A single binary; plugins are selected at compile time (this differs from Nginx's modular approach and leads to the “directive exists but is unavailable” problem; see 6.3)

Trade-off: plugins must be custom-compiled; `xcaddy build` is a common operation.

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

**Build from source (when extra plugins are needed)**

```bash
go install github.com/caddyserver/caddy/v2/cmd/caddy@latest
# 或者用 xcaddy 打插件
xcaddy build --with github.com/caddyserver/ratelimit
```

Note that the old `go get` syntax has not been used to install executables since Go 1.17; `go install ...@version` is the current method.

## 2. Minimal Caddyfile example

```caddyfile
example.com {
    root * /var/www/example.com
    file_server
}
```

Three things: match the domain, set the root directory, and enable static file serving.

`*` here means “match all requests”; it is a path matcher, not a wildcard domain.

## 3. Automatic HTTPS: when it is triggered

**No `tls` directive is needed.** As long as a domain appears in the Caddyfile (and 80/443 are reachable from the public internet), Caddy will:

1. Request a certificate from Let's Encrypt or ZeroSSL (ACME)
2. Automatically complete HTTP-01 or TLS-ALPN-01 validation
3. Automatically renew before expiration

Common situations that cause automatic HTTPS to fail:

| Symptom | Cause |
|---|---|
| Stuck at `obtaining certificate` | 80/443 blocked by a firewall or cloud security group |
| Certificate issued but browser reports a certificate error | Domain DNS does not point to this machine, or the CDN origin configuration in between is incorrect |
| Certificate application for an internal domain fails | Internal domains cannot complete ACME validation; a DNS-01 challenge or a self-signed certificate is required |

Custom certificates (internal network, existing certificates) are the only case that requires `tls`:

```caddyfile
internal.example.com {
    tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
    root * /var/www
    file_server
}
```

To use Caddy's self-signed certificate locally/on an internal network:

```caddyfile
{
    local_certs
}
```

## 4. Reverse proxy

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

A few practical points for reverse proxy:

- Automatically passes through `X-Forwarded-For` and `X-Forwarded-Proto`; the backend gets the real IP without extra configuration
- WebSocket is supported automatically; no `Upgrade` header handling is required
- When the upstream is HTTPS, use `reverse_proxy https://backend:8443`; for self-signed certificates, add `transport http { tls_insecure_skip_verify }` (test environments only)

## 5. Routing and middleware

Caddy directives execute in a fixed order (`encode` → `reverse_proxy`, etc. have a built-in order); use `route` when you need to force a custom order:

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

The `gzip` directive has been replaced by `encode` in v2:

```caddyfile
example.com {
    encode zstd gzip
    root * /var/www
    file_server
}
```

### 5.2 Common middleware

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

### 5.3 `rate_limit` is not a built-in directive

Writing `rate_limit` directly gives:

```
Error: adapting config using caddyfile: unrecognized directive: rate_limit
```

It comes from the third-party plugin `github.com/mholt/caddy-ratelimit` and must be recompiled with `xcaddy build --with github.com/mholt/caddy-ratelimit`. This is the most common reason for “the tutorial works but my machine reports an error”—Caddy's directive set depends on which modules were selected at compile time; `caddy list-modules` lists what the current binary actually contains.

## 6. Operational essentials

### 6.1 Validate before reloading

```bash
caddy validate --config /etc/caddy/Caddyfile   # 只校验，不生效
sudo systemctl reload caddy                    # 平滑重载，不断连接
```

Running `restart` directly after modifying the config interrupts connections; `reload` is the zero-downtime approach. `validate` can catch syntax errors before reloading, preventing the service from failing to start.

### 6.2 Formatting

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### 6.3 Check which directives the current binary supports

```bash
caddy list-modules | grep -i ratelimit
```

When troubleshooting “directive not recognized”, first confirm whether the module exists, then suspect the syntax.

### 6.4 Admin API

Caddy exposes a configuration API at `localhost:2019`; `caddy reload` actually POSTs the configuration to it:

```bash
curl localhost:2019/config/          # 查看当前生效配置
curl localhost:2019/metrics          # Prometheus 指标
```

This endpoint is also the entry point for dynamic configuration in containerized deployments.

## 7. Typical use cases

- **Static sites / blogs**: `root` + `file_server`, fully automatic certificates
- **Reverse proxy**: expose internal services (panels, APIs, database admin interfaces) to a domain, eliminating the need for a separate Nginx
- **Local development**: start a server with one line using `caddy file-server --browse`, or use `caddy reverse-proxy --from :80 --to :3000`
- **Multiple sites coexisting**: write multiple domain blocks in the same Caddyfile; certificates are requested independently for each

## References

- [Caddy official documentation](https://caddyserver.com/docs/)
- [Caddyfile directive reference](https://caddyserver.com/docs/caddyfile/directives)
- [Automatic HTTPS documentation](https://caddyserver.com/docs/automatic-https)
- [caddy-ratelimit plugin](https://github.com/mholt/caddy-ratelimit)