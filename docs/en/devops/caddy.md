---
isTimeLine: true
title: Getting Started with Caddy
description: Caddy is a powerful, easy-to-use open-source web server known for its automatic HTTPS feature.
date: 2024-05-15
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
    content: Caddy,Web server,Reverse proxy,Getting Started with Caddy,Caddy Tutorial,HTTPS configuration,Reverse proxy configuration,Caddyfile
translatedFrom: 20185ba713139114
---
# Getting Started with Caddy: Quickly Build a Modern Web Server

Compared with Nginx and Apache, Caddy offers advantages such as simple configuration, automatic HTTPS, rich features, and superior performance. It is suitable as a web server for scenarios such as personal websites, web applications, API services, reverse proxying, and load balancing.

## 1. Introduction

### 1.1 What Is Caddy?

Caddy is an open-source, powerful, and easy-to-use modern web server written in Go. It is known for its powerful features, security, and native HTTPS support. Whether you are building a personal website, hosting a web application, or setting up a reverse proxy, Caddy can simplify your workflow with concise configuration and efficient performance.

### 1.2 Why Choose Caddy? Comparison with Nginx and Apache

Compared with traditional web servers such as Nginx and Apache, Caddy's advantages include:

*   **Easy to configure:** Caddy uses a concise and easy-to-understand Caddyfile for configuration. There is no need to deal with complex configuration files and directives, so even beginners can get started easily.
*   **Automatic HTTPS:** Caddy can automatically obtain and renew Let's Encrypt certificates, making it easy to enable HTTPS encryption and ensure website security.
*   **Rich built-in features:** Caddy includes many common features such as reverse proxy, load balancing, and Gzip compression. No additional modules are required, and it works out of the box.
*   **Superior performance:** Caddy is based on Go's high-performance networking library and can handle large numbers of concurrent connections, providing fast and reliable service.

### 1.3 Main Features and Advantages of Caddy

*   **Automatic HTTPS (Let's Encrypt)**
*   **HTTP/2 support**
*   **Virtual hosts**
*   **Reverse proxy**
*   **Load balancing**
*   **Static file serving**
*   **Gzip compression**
*   **Request limiting**
*   **Easily extensible plugin system**

## 2. Caddy Installation

Caddy provides precompiled binaries for Linux, macOS, and Windows, making it easy for users to install quickly.

**Linux (using a package manager):**

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install caddy

# CentOS/Fedora
sudo yum install caddy
```

**macOS (using Homebrew):**

```bash
brew update
brew install caddy
```

**Windows (using Chocolatey):**

```powershell
choco install caddy
```

**Install from source:**

```bash
go get github.com/caddyserver/caddy/v2
go install github.com/caddyserver/caddy/v2/cmd/caddy
```

## 3. Caddyfile Getting Started: Simple Configuration Example

The Caddyfile is Caddy's configuration file, using concise and easy-to-understand syntax. The following is a simple Caddyfile example:

```
example.com {
  root * /var/www/example.com
  file_server
}
```

This configuration file defines a website `example.com`, sets the root directory to `/var/www/example.com`, and enables static file serving.

## 4. Caddy HTTPS Configuration: Automatically Obtain Let's Encrypt Certificates

Caddy can automatically obtain and renew Let's Encrypt certificates. Simply add the `tls` directive to the Caddyfile:

```
example.com {
  root * /var/www/example.com
  file_server
  tls
}
```

Caddy will automatically generate certificates and configure HTTPS access. If you need to use your own certificates, you can use the `tls.cert_file` and `tls.key_file` directives to specify the certificate file and key file.

## 5. Caddy Reverse Proxy Configuration: Easily Forward Traffic

Caddy can act as a reverse proxy and forward traffic to backend applications. The following is an example of forwarding traffic to local port 8080:

```
example.com {
  reverse_proxy localhost:8080
}
```

You can also use the `reverse_proxy` directive to configure multiple backend servers and set a load balancing policy:

```
example.com {
  reverse_proxy localhost:8080 localhost:8081 {
    lb_policy round_robin
  }
}
```

## 6. Caddy Advanced Features

### 6.1 Virtual Hosts: Serve Multiple Websites

Caddy can easily serve multiple websites. You can use multiple blocks in the Caddyfile to define different virtual hosts, with each block corresponding to a domain name or IP address.

```
example.com {
  root * /var/www/example.com
  file_server
}

blog.example.com {
  root * /var/www/blog.example.com
  file_server
  reverse_proxy localhost:3000
}
```

### 6.2 Static File Serving: Optimize Performance and Caching

Caddy can efficiently serve static files and provides caching mechanisms to improve performance. You can use the `file_server` directive to enable static file serving and the `browse` directive to enable directory browsing.

```
example.com {
  root * /var/www/example.com
  file_server {
    browse
  }
}
```

### 6.3 Middleware: Extend Caddy Functionality

Caddy supports middleware, which can extend Caddy's functionality, such as Gzip compression, request limiting, and redirects. You can use the `route` directive to define routing rules and use middleware in those rules.

```
example.com {
  root * /var/www/example.com
  file_server

  route /api/* {
    reverse_proxy localhost:8080
    gzip
    rate_limit
  }
}
```

### 6.4 API: Dynamic Configuration with the Caddy API

Caddy provides an API interface that allows you to dynamically configure Caddy using HTTP requests. You can use the API for certificate management, configuration updates, statistics retrieval, and other operations.

## 7. Caddy Use Cases

*   **Personal websites and blogs:** Caddy can easily host your personal website or blog and provide HTTPS encryption and static file serving.
*   **Web applications and API services:** Caddy can act as a reverse proxy, forwarding traffic to your web application or API service and providing load balancing and security protection.
*   **Reverse proxy and load balancing:** Caddy can act as a reverse proxy, distributing traffic to multiple backend servers and providing load balancing to improve availability and performance.
*   **Development environments:** Caddy can serve as a local development server, providing automatic HTTPS and fast file serving for convenient web development and debugging.

## 8. Summary and Resources

Caddy is a powerful and easy-to-use modern web server that offers many advantages, such as automatic HTTPS, reverse proxying, and load balancing. Caddy is suitable for various use cases, from personal websites to large web applications.

*   **Caddy official website:** https://caddyserver.com/
*   **Caddy documentation:** https://caddyserver.com/docs/
*   **Caddy GitHub repository:** https://github.com/caddyserver/caddy