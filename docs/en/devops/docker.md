---
isTimeLine: true
sticky: 4
title: "Docker: From Beginner to Practice"
description: Explain image layer structure; the rule that build cache is invalidated instruction by instruction; the isolation boundaries provided by namespaces and cgroups; port mapping and the two ways to mount data volumes; multi-stage build slimming techniques; and the troubleshooting order for failures such as a container exiting immediately after startup, inaccessible ports, and a stop that waits ten seconds before being force-killed, plus how to read common exit codes in actual troubleshooting.
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
    content: Docker,Dockerfile,Image Layers,overlay2,namespace,cgroup,Data Volume,Multi-stage build
translatedFrom: f5443a54c755dda6
---
# Docker: From Beginner to Practice

The same code runs fine on a development machine, but fails to start on the server because of a glibc or Node version mismatch; an image pushed to the registry is 1.2 GB, and every release pull takes several minutes; once the container restarts, all data written inside it is gone. These three types of problems correspond to how images are built, how containers run, and where data is stored.

The following sections proceed in this order: isolation mechanisms, image layering, common commands, writing Dockerfiles, running and persistence, slimming down, and troubleshooting. All commands are based on Docker Engine on Linux.

## Four Things to Remember First

1. **An image is a set of read-only layers; a container is an image plus a writable layer**. The writable layer disappears when the container is deleted, so data that must be retained has to be mounted as a volume.
2. **A container is an ordinary Linux process**. Isolation relies on namespaces, resource limits rely on cgroups, and it has no kernel of its own.
3. **Build cache is invalidated instruction by instruction**: if the text of an instruction or the files it `COPY`s change, the cache for that instruction and all subsequent layers is invalidated.
4. **A container exits when PID 1 exits**. `docker run -d` only puts the process in the background; it does not mean the container stays running.

## 1. What Containers Isolate

Early Docker (before 0.9) used LXC directly to manage containers, then switched to its own implementation, libcontainer; in 2015 this part was donated to the OCI and evolved into runc. The current call chain is:

```text
docker CLI → dockerd → containerd → containerd-shim → runc → 容器进程
```

runc only creates the process according to the OCI specification, sets up namespaces and cgroups, and exits after creation; the container process is hosted by the shim. So “Docker is based on LXC” is an outdated statement—LXC was only used as the container driver in versions before 0.9.

Namespaces determine what is visible:

| namespace | Isolated content |
|---|---|
| PID | Process IDs; inside the container, it sees its own PID 1 |
| NET | Network interfaces, IP, ports, routing table |
| MNT | Mount points and filesystem view |
| UTS | Hostname and domain name |
| IPC | Semaphores, message queues |
| USER | User and UID mapping |

cgroups determine how much can be used:

```bash
docker run -d --memory 512m --memory-swap 512m --cpus 1.5 nginx
```

Note that when `--memory-swap` is not set, it defaults to twice `--memory`; to completely disable swap, set both to the same value. Under cgroup v2, these limits are managed uniformly by systemd's `docker-<id>.scope`, and `docker stats` reads the numbers from it.

Namespaces and cgroups are both kernel features, so containers run natively on Linux; Docker Desktop on macOS and Windows actually runs inside a lightweight VM, and file mounts and networking incur an extra layer of overhead.

**The special nature of PID 1**: process 1 inside the container is responsible for reaping zombie processes and forwarding signals. When the application itself does not handle `SIGTERM`, `docker stop` waits 10 seconds and then sends `SIGKILL`, which manifests as “stopping is slow” or “data was not flushed to disk in time.” Add `--init` to let tini act as PID 1.

## 2. Image Layering and Build Cache

An image is composed of several read-only layers stacked together, and at runtime a writable layer is added on top. The default storage driver is `overlay2` (when the underlying filesystem is ext4 or xfs). Reads and writes are done through copy-on-write: modifying a file first copies it from a lower layer to the writable layer, then modifies it.

This has two direct consequences:

- Multiple images based on the same base image share the lower layers, saving both disk space and pull traffic.
- Writing many small files inside a container is slower than on the host; applications such as databases should mount their data directories as volumes.

The build cache invalidation rules are worth remembering separately:

| Instruction | When the cache is invalidated |
|---|---|
| `COPY package*.json ./` | Only when the contents of these two files change |
| `RUN npm ci` | When the previous instruction is invalidated, or the command text changes |
| `COPY . .` | When any source code changes |

So the order is “copy dependency manifests first → install dependencies → then copy source code.” If reversed—first `COPY . .` and then install dependencies—a one-line code change requires reinstalling all dependencies. The same applies to `.dockerignore`: changes to ignored files do not trigger cache invalidation, and it also prevents `node_modules` and `.git` from being stuffed into the build context and slowing down uploads. Common contents:

```text
node_modules
.git
dist
*.log
```

## 3. Common Commands

| Command | Purpose |
|---|---|
| `docker pull` / `push` | Pull or push images |
| `docker images` | List local images |
| `docker build -t name:tag .` | Build using the Dockerfile in the current directory |
| `docker run` | Create and start a container |
| `docker ps -a` | List containers (including exited ones) |
| `docker logs -f --tail 100` | Follow logs |
| `docker exec -it <id> sh` | Enter a running container |
| `docker inspect` | View full configuration and status |
| `docker stats` | Real-time resource usage |
| `docker rm` / `rmi` | Remove a container / image |
| `docker system df` | Show disk usage of images, containers, and volumes |
| `docker system prune` | Clean up unused objects |

`docker ps` shows only running containers by default. When a container “disappears right after starting,” add `-a` to see the exit code.

## 4. Writing a Dockerfile

Take a Node.js application as an example, using a multi-stage build to separate dependencies and runtime:

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

1. `FROM node:24-slim` — `slim` is much smaller than the default tag and still uses glibc, so native modules do not need to be recompiled; `alpine` uses musl, and dependencies with precompiled binary packages can easily fail at runtime with missing symbols.
2. `npm ci` installs strictly according to `package-lock.json` and is reproducible; `npm install` may rewrite the lock file, making the image non-reproducible.
3. `USER node` switches to non-root. Avoid running as root inside the container by default; otherwise, after a container escape, the impact could extend to the host.
4. `EXPOSE 3000` only declares and documents the port; it does not publish it. Actual external exposure requires `-p`.
5. `CMD` is the default command; a command appended after the image name, such as `docker run image sh`, **replaces** it. `ENTRYPOINT`, by contrast, is a fixed executable, and appended content becomes arguments.
6. Only one `CMD` in a Dockerfile takes effect; if multiple are written, the last one overrides the previous ones.

## 5. Running Containers: Ports, Data, and Exits

```bash
docker run -d --name app \
  -p 8080:3000 \
  -v app-data:/app/data \
  -e NODE_ENV=production \
  --restart unless-stopped \
  my-node-app
```

- `-p 8080:3000` means “host port:container port.” If no host IP is specified, it listens on `0.0.0.0`; writing `-p 127.0.0.1:8080:3000` exposes it only to the local machine.
- If the port is open but still inaccessible, first check whether the application is bound to `127.0.0.1` instead of `0.0.0.0`—the loopback address inside the container is not the same as on the host.

There are two ways to mount data:

| Type | Syntax | Suitable for |
|---|---|---|
| Named volume | `-v app-data:/app/data` | Databases, persistent data that needs backup |
| Bind mount | `-v $(pwd)/data:/app/data` | Development, where code changes take effect immediately |

Named volumes are managed by Docker and located at `/var/lib/docker/volumes/`. Deleting a container does not delete the volume; you must explicitly run `docker volume rm`. Bind mounts map a host directory directly and involve more permission and SELinux label issues (under SELinux, you need to add `:z`).

Common reasons containers exit:

```bash
docker ps -a                    # 看 STATUS 里的退出码
docker logs <id>                # 前台输出，应用崩溃的堆栈在这里
docker inspect <id> --format '{{.State.ExitCode}} {{.State.OOMKilled}}'
```

Exit code `137` is basically receipt of `SIGKILL`; combined with `OOMKilled=true`, it means the memory limit was hit.

## 6. Trimming Image Size

| Technique | Effect |
|---|---|
| Switch to a `slim` base image | Typically saves hundreds of MB |
| Multi-stage builds | Build toolchain doesn't end up in the final image |
| Combine `RUN` steps and clean package caches | Fewer layers, no leftover `apt` cache |
| `.dockerignore` | Shrinks the build context |

When installing packages in Debian-based base images, write it as a single line:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

Writing `apt-get update` and `apt-get install` separately leaves stale package indexes in the cache layer.

Use `docker history <image>` to see how much space each layer takes; to drill down to specific files, use tools like `dive`.

## 7. Troubleshooting Reference

| Symptom | Common cause |
|---|---|
| Container exits immediately on start | Main process errors out; check `docker logs`; `-d` swallows foreground output |
| `exec` reports container not running | Container has exited; confirm status with `docker ps -a` |
| Port unreachable | No `-p` flag, or the app is bound to `127.0.0.1` inside the container |
| `COPY` can't find file during build | Excluded by `.dockerignore`, or the path is relative to the build context |
| Disk usage keeps growing | Dangling images and old containers piling up; check details with `docker system df` |
| Garbled Chinese characters / wrong timezone | Slim images lack `tzdata` and locales; install them and set `TZ` |
| Stopping a container takes 10 seconds | The app doesn't handle `SIGTERM`; add `--init` or implement signal handling |

## References

- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [overlay2 storage driver](https://docs.docker.com/engine/storage/drivers/overlay2/)
- [docker container run command reference](https://docs.docker.com/reference/cli/docker/container/run/)