---
isTimeLine: true
title: "Getting Started with Caddy: Automatic HTTPS and Reverse Proxy"
description: Installing Caddy v2, Caddyfile basics, and reverse proxy configuration. Focuses on automatic HTTPS triggers, why the tls directive is unnecessary, why rate_limit errors at startup, and correct usage of validate/reload.
date: 2024-05-15
updated: 2026-10-31
tags:
- Web server
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
translatedFrom: df190c84b5c29574
---
## How Caddy Differs from Other Web Servers

Caddy is written in Go, and its biggest difference from Nginx/Apache is its **default behavior**:

- After a domain is configured, it automatically obtains and renews certificates; no additional TLS directives are needed
- The config file is the Caddyfile (there is also a native JSON format); dozens of lines can express common requirements
- A single binary; plugins are selected at compile time (this differs from Nginx's modular approach and leads to the "directive exists but is unavailable" problem, see 6.3)

The cost: plugins must be custom-compiled, and `xcaddy build` is a common operation.

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

Note that the old `go get` form is no longer used to install executables after Go 1.17; `go install ...@version` is the current way.

## 2. Minimal Caddyfile Example

```caddyfile
example.com {
    root * /var/www/example.com
    file_server
}
```

Three things: match the domain, set the root directory, and enable static file serving.

`*` here means "match all requests"; it is a path matcher, not a wildcard domain.

## 3. Automatic HTTPS: When It Is Triggered

**No need to write the `tls` directive.** As long as what appears in the Caddyfile is a domain (and 80/443 are publicly accessible), Caddy will:

1. Request a certificate from Let's Encrypt or ZeroSSL (ACME)
2. Automatically complete HTTP-01 or TLS-ALPN-01 validation
3. Automatically renew before expiration

Common cases that cause automatic HTTPS to fail:

| Symptom | Cause |
|---|---|
| Stuck at `obtaining certificate` | 80/443 is blocked by a firewall or cloud security group |
| Certificate obtained but the browser reports a certificate error | Domain resolution does not point to this machine, or the CDN origin configuration in between is wrong |
| Internal domain application fails | Internal domains cannot complete ACME validation; a DNS-01 challenge or a self-signed certificate is required |

Custom certificates (internal network, existing certificates) are the only case that requires `tls`:

```caddyfile
internal.example.com {
    tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
    root * /var/www
    file_server
}
```

To use Caddy self-signed locally/on an internal network:

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

Several practical points for reverse proxying:

- Automatically passes through `X-Forwarded-For` and `X-Forwarded-Proto`; the backend gets the real IP without extra configuration
- WebSocket is supported automatically; no `Upgrade` header handling is needed
- When the upstream is HTTPS, use `reverse_proxy https://backend:8443`; for self-signed certificates add `transport http { tls_insecure_skip_verify }` (test environments only)

## 5. Routing and Middleware

Caddy directives execute in a fixed order (`encode` → `reverse_proxy`, etc. have a built-in order); to force a custom order, use `route`:

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

Writing `rate_limit` directly will produce:

```
Error: adapting config using caddyfile: unrecognized directive: rate_limit
```

It comes from the third-party plugin `github.com/mholt/caddy-ratelimit` and must be recompiled with `xcaddy build --with github.com/mholt/caddy-ratelimit`. This is the most common reason for "the tutorial runs, but my machine reports an error"—Caddy's directive set depends on which modules were selected at compile time; `caddy list-modules` lists what the current binary actually has.

## 6. Operations Essentials

### 6.1 Validate Before Reloading

```bash
caddy validate --config /etc/caddy/Caddyfile   # 只校验，不生效
sudo systemctl reload caddy                    # 平滑重载，不断连接
```

Modifying the config and directly running `restart` will interrupt connections; `reload` is the zero-downtime way. `validate` can catch syntax errors before reloading and prevent the service from failing to start.

### 6.2 Formatting

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### 6.3 Check Which Directives the Current Binary Supports

```bash
caddy list-modules | grep -i ratelimit
```

When troubleshooting "directive not recognized", first confirm whether the module exists, then suspect the syntax.

### 6.4 Admin API

Caddy exposes the config API on `localhost:2019`; `caddy reload` actually POSTs the config to it:

```bash
curl localhost:2019/config/          # 查看当前生效配置
curl localhost:2019/metrics          # Prometheus 指标
```

This path is also the entry point for dynamic configuration in containerized deployments.

## 7. Typical Uses

- **Static sites / blogs**: `root` + `file_server`, with fully automatic certificates
- **Reverse proxy**: expose internal network services (panels, APIs, database admin UIs) to a domain, eliminating a separate Nginx
- **Local development**: `caddy file-server --browse` starts a server in one line, or `caddy reverse-proxy --from :80 --to :3000`
- **Multiple sites coexisting**: write multiple domain blocks in the same Caddyfile; certificates are applied for independently

## References

- [Caddy official documentation](https://caddyserver.com/docs/)
- [Caddyfile directive reference](https://caddyserver.com/docs/caddyfile/directives)
- [Automatic HTTPS documentation](https://caddyserver.com/docs/automatic-https)
- [caddy-ratelimit plugin](https://github.com/mholt/caddy-ratelimit)