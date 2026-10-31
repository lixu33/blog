---
isTimeLine: true
sticky: 4
title: "Docker: From Beginner to Practice"
description: Explains image layer structure, how build cache is invalidated instruction by instruction, the isolation boundaries provided by namespaces and cgroups, port mapping and the two ways to mount data volumes, multi-stage build slimming techniques, and the troubleshooting order for failures such as containers exiting immediately on startup, unreachable ports, and stops that take ten seconds before being force-killed, plus how to read common exit codes in practice.
date: 2024-05-17
updated: 2026-10-31
tags:
- Docker
- DevOps
- Microservices
categories:
- DevOps Operations
- Containerization technology
head:
- - meta
  - name: keywords
    content: Docker,Dockerfile,Image Layering,overlay2,namespace,cgroup,Data volume,Multi-stage build
translatedFrom: 5035ba93b546645f
---
# Docker: From Beginner to Practice

The same code runs fine on the development machine, but fails to start on the server because of a glibc or Node version mismatch; the image pushed to the registry is 1.2 GB, and every release pull takes several minutes; after a container restarts once, all data written inside is gone. These three types of problems correspond respectively to how images are built, how containers run, and where data is stored.

The following sections cover isolation mechanisms, image layering, common commands, Dockerfile writing, running and persistence, slimming down, and troubleshooting. The commands are based on Docker Engine on Linux.

## Four things to remember first

1. **An image is a set of read-only layers; a container is the image + one writable layer**. The writable layer disappears when the container is deleted, so data that must be retained must be mounted as a volume.
2. **A container is an ordinary Linux process**. Isolation relies on namespaces, resource limits rely on cgroups, and it has no kernel of its own.
3. **Build cache is invalidated instruction by instruction**: if the text of an instruction or the files it `COPY`s in change, the cache for that instruction and all subsequent layers becomes invalid.
4. **A container exits when PID 1 exits**. `docker run -d` only puts the process in the background; it does not mean it stays running permanently.

## 1. What containers isolate

Early Docker (before 0.9) used LXC directly to manage containers; afterward it switched to its own libcontainer implementation. In 2015 this part was donated to OCI and evolved into runc. The current call chain is:

```text
docker CLI → dockerd → containerd → containerd-shim → runc → 容器进程
```

runc only creates processes according to the OCI spec, configures namespaces and cgroups, and then exits; the container process is supervised by the shim. So “Docker is based on LXC” is an outdated statement; LXC was used as a container driver only in versions before 0.9.

Namespaces determine what is visible:

| namespace | What it isolates |
|---|---|
| PID | Process IDs; inside the container it sees its own PID 1 |
| NET | Network interfaces, IP, ports, routing table |
| MNT | Mount points and filesystem view |
| UTS | Hostname and domain name |
| IPC | Semaphores, message queues |
| USER | User and UID mapping |

cgroups determine how much can be used:

```bash
docker run -d --memory 512m --memory-swap 512m --cpus 1.5 nginx
```

Note that when `--memory-swap` is not set, it defaults to twice `--memory`; to completely disable swap, set both to the same value. Under cgroup v2 these limits are managed uniformly by systemd's `docker-<id>.scope`, and `docker stats` reads its numbers.

Namespaces and cgroups are kernel features, so they run natively on Linux; Docker Desktop on macOS and Windows actually runs inside a lightweight VM, so file mounts and networking incur an extra layer of overhead.

**The special role of PID 1**: the PID 1 process in a container is responsible for reaping zombie processes and forwarding signals. When the application itself does not handle `SIGTERM`, `docker stop` waits 10 seconds and then sends `SIGKILL`, which manifests as “stopping is slow” or “data did not get flushed to disk in time”. Add `--init` to let tini act as PID 1.

## 2. Image layers and build cache

An image consists of several read-only layers stacked together; at runtime a writable layer is added on top. The default storage driver is `overlay2` (when the underlying filesystem is ext4 or xfs), and reads/writes are done via copy-on-write: modifying a file first copies it from a lower layer to the writable layer, then modifies it.

This has two direct consequences:

- Multiple images based on the same base image share lower layers, saving both disk space and pull traffic
- When a container writes many small files, performance is lower than on the host; for applications such as databases, the data directory should be mounted as a volume

The build cache invalidation rules are worth remembering separately:

| Instruction | When cache is invalidated |
|---|---|
| `COPY package*.json ./` | Only when the contents of these two files change |
| `RUN npm ci` | The previous instruction is invalidated, or the command text changes |
| `COPY . .` | Any source code change |

So the order is “copy dependency manifests first → install dependencies → then copy source code”. If written the other way around—`COPY . .` first and then installing dependencies—changing a single line of code requires reinstalling all dependencies. The same applies to `.dockerignore`—changes to ignored files do not invalidate the cache, and it also prevents `node_modules` and `.git` from being stuffed into the build context and slowing down the upload. Common contents:

```text
node_modules
.git
dist
*.log
```

## 3. Common commands

| Command | Purpose |
|---|---|
| `docker pull` / `push` | Pull and push images |
| `docker images` | List local images |
| `docker build -t name:tag .` | Build using the Dockerfile in the current directory |
| `docker run` | Create and start a container |
| `docker ps -a` | List containers (including exited ones) |
| `docker logs -f --tail 100` | Follow logs |
| `docker exec -it <id> sh` | Enter a running container |
| `docker inspect` | View full configuration and state |
| `docker stats` | Real-time resource usage |
| `docker rm` / `rmi` | Remove containers / images |
| `docker system df` | Show disk usage of images, containers, and volumes |
| `docker system prune` | Clean up unused objects |

`docker ps` by default shows only running containers; when a container “disappears immediately after starting”, add `-a` to see the exit code.

## 4. Writing a Dockerfile

Take a Node.js application as an example; use a multi-stage build to separate dependencies and runtime:

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

Key points:

1. `FROM node:24-slim` — `slim` is much smaller than the default tag and still uses glibc, so native modules do not need to be recompiled; `alpine` uses musl, and dependencies with prebuilt binary packages can easily fail at runtime with missing symbols.
2. `npm ci` installs strictly according to `package-lock.json` and is reproducible; `npm install` may rewrite the lock file, making the image non-reproducible.
3. `USER node` switches to non-root, avoiding running as root by default inside the container; otherwise, after a container escape the impact scope expands to the host.
4. `EXPOSE 3000` only declares and documents; it does not publish ports; actual external exposure requires `-p`.
5. `CMD` is the default command; a command appended after the image name such as `docker run image sh` will **replace** it; `ENTRYPOINT` is a fixed executable, and appended content becomes arguments.
6. Only one `CMD` in a Dockerfile takes effect; if multiple are written, the last one overrides the previous ones.

## 5. Running containers: ports, data, and exit

```bash
docker run -d --name app \
  -p 8080:3000 \
  -v app-data:/app/data \
  -e NODE_ENV=production \
  --restart unless-stopped \
  my-node-app
```

- `-p 8080:3000` is “host port:container port”. When no host IP is specified, it listens on `0.0.0.0`; writing `-p 127.0.0.1:8080:3000` exposes it only to the local machine.
- If the port is reachable but still inaccessible, first check whether the application is bound to `127.0.0.1` instead of `0.0.0.0`—the loopback address inside the container is not the same as that on the host.

There are two ways to mount data:

| Type | Syntax | Use case |
|---|---|---|
| Named volume | `-v app-data:/app/data` | Databases, persistent data that needs backup |
| Bind mount | `-v $(pwd)/data:/app/data` | Code changes take effect immediately during development |

Named volumes are managed by Docker and located at `/var/lib/docker/volumes/`; deleting a container does not delete the volume—you must explicitly use `docker volume rm`. Bind mounts directly map a host directory and involve more permission and SELinux label issues (under SELinux you need to add `:z`).

Common reasons for container exit:

```bash
docker ps -a                    # 看 STATUS 里的退出码
docker logs <id>                # 前台输出，应用崩溃的堆栈在这里
docker inspect <id> --format '{{.State.ExitCode}} {{.State.OOMKilled}}'
```

Exit code `137` is basically receiving `SIGKILL`; combined with `OOMKilled=true`, it means the memory limit was hit.

## 6. Image Slimming

| Approach | Effect |
|---|---|
| Switch to a `slim` base image | Usually saves a few hundred MB |
| Multi-stage builds | Build toolchain stays out of the final image |
| Merge `RUN` steps and clean package caches | One fewer layer, no leftover `apt` cache |
| `.dockerignore` | Shrinks the build context |

When installing packages in a Debian-based base image, write it as a single line:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

Splitting `apt-get update` and `apt-get install` into separate steps leaves a stale package index behind in the cache layer.

Use `docker history <image>` to see how large each layer is; to drill down to specific files, use a tool like `dive`.

## 7. Troubleshooting Reference

| Symptom | Common Cause |
|---|---|
| Container exits right after start | The main process errored; check `docker logs`; `-d` swallows foreground output |
| `exec` reports the container is not running | The container has already exited; confirm its state with `docker ps -a` |
| Port unreachable | No `-p` mapping, or the app binds to `127.0.0.1` inside the container |
| `COPY` can't find a file during build | Excluded by `.dockerignore`, or the path is relative to the build context |
| Disk keeps growing | Dangling images and old containers piling up; use `docker system df` for details |
| Garbled Chinese / wrong timezone | Slim images lack `tzdata` and locales; install them yourself and set `TZ` |
| Stopping a container takes 10 seconds | The app doesn't handle `SIGTERM`; add `--init` or implement signal handling |

## Related Reading

- [Kubernetes Getting Started Guide](/en/devops/k8s): scheduling, service discovery and troubleshooting once images reach the cluster
- [Getting Started with Caddy: Automatic HTTPS and Reverse Proxy](/en/devops/caddy): when running a web service in a container, let it handle reverse proxying and certificates
- [Spring Boot Auto-configuration and Startup Flow](/en/backend/springBoot): build and configuration loading before you package the app into an image

## References

- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [overlay2 storage driver](https://docs.docker.com/engine/storage/drivers/overlay2/)
- [docker container run command reference](https://docs.docker.com/reference/cli/docker/container/run/)