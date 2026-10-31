---
isTimeLine: true
title: Kubernetes 入门指南
description: 从对象之间的层级关系讲起：Deployment 如何管理 ReplicaSet 与 Pod、控制平面各组件的分工、本地集群里外部地址为何一直待分配、Service 的四种暴露方式与集群内域名解析、密钥对象只做编码不加密的限制，以及容器卡在等待调度或反复重启时的排查顺序和常用回滚命令。
date: 2024-05-20
updated: 2026-10-31
tags:
- Kubernetes
- 容器编排
- DevOps
categories:
- DevOps 运维
- Kubernetes
head:
- - meta
  - name: keywords
    content: Kubernetes, k8s, 容器编排, Deployment, Service, ConfigMap, Secret, Pod 排查
---

# Kubernetes 入门指南

几台机器上用 compose 跑服务，某台宕机后要人工把容器搬到另一台，流量涨了还得改 Nginx upstream 加后端。Kubernetes 把这些动作交给控制器自动完成，代价是要先接受它的一套对象模型，并改掉「登机器上看进程」的习惯。

下面从对象关系和调谐循环讲起，再到控制平面组件、本地集群、Deployment 与 Service 的写法、配置存储，最后是 Pod 起不来时的排查顺序。

## 先理清四条关系

1. **Deployment → ReplicaSet → Pod** 是三层嵌套，改镜像要改 Deployment 的 Pod 模板；直接改 Pod 会被 ReplicaSet 按模板重建回去。
2. **Service 通过 label selector 选 Pod**，不记 IP。Pod 重建后 IP 会变，Service 的集群 IP 不变。
3. **一切是声明式的**：对象里描述期望状态，控制器持续把实际状态拉回期望状态（reconcile），不需要你下发「启动」命令。
4. **Pod 是最小调度单位**，同 Pod 内容器共享网络命名空间，用 `localhost` 互访，但生命周期绑在一起。

## 一、核心对象

| 对象 | 作用 | 关键点 |
|---|---|---|
| Pod | 最小部署单元，一个或多个共享网络的容器 | 一般不直接创建 |
| Deployment | 管理副本数与滚动更新 | 无状态应用首选 |
| StatefulSet | 有序、稳定网络标识的副本 | 数据库等有状态场景 |
| DaemonSet | 每个节点各跑一份 | 日志采集、网络插件 |
| Service | 为一组 Pod 提供固定访问入口 | 靠 selector 关联 |
| Ingress | 七层路由，按域名/路径分发 | 需要 Ingress Controller |
| ConfigMap / Secret | 配置与敏感数据 | Secret 默认只做编码 |
| Namespace | 逻辑隔离与配额边界 | 不隔离网络，需 NetworkPolicy |

`Job` 与 `CronJob` 用于跑完即止的任务，前者一次性，后者按 cron 表达式调度。

## 二、控制平面与工作节点

官方文档早已不用 master 这组称呼，现在叫控制平面（control plane）和工作节点。

| 组件 | 位置 | 职责 |
|---|---|---|
| kube-apiserver | 控制平面 | 唯一的读写入口，校验请求后写 etcd |
| etcd | 控制平面 | 保存全部集群状态，只有 apiserver 直接访问 |
| kube-scheduler | 控制平面 | 给新 Pod 选节点 |
| kube-controller-manager | 控制平面 | 跑各类控制器，含节点、端点、副本控制器 |
| kubelet | 每个节点 | 按 PodSpec 拉起容器并上报状态 |
| kube-proxy | 每个节点 | 维护 Service 的转发规则 |
| 容器运行时 | 每个节点 | containerd 等，实际跑容器 |

几点容易混的地方：

- **kubelet 不负责容器网络**，IP 分配和跨节点连通由 CNI 插件（Calico、Cilium、Flannel）实现，集群没装 CNI 时 Pod 会一直 `Pending` 或 `ContainerCreating`。
- **调度只看 requests，不看实际用量**。Pod 没写 `resources.requests` 时调度器按 0 计算，会超卖到节点 OOM。
- 副本控制器、端点控制器这类东西都打包在 `kube-controller-manager` 一个进程里，不需要单独部署。
- 高可用部署至少要 3 个控制平面节点，etcd 用 Raft，需要多数派存活才能写入。

## 三、本地起一个集群

minikube 单机起集群最快，需要先装好 Docker 或其它驱动：

```bash
minikube start --cpus=4 --memory=8g --driver=docker
kubectl get nodes
kubectl cluster-info
```

`kubectl` 单独安装，minikube 会把 context 写进 `~/.kube/config`，用 `kubectl config use-context minikube` 切换。

一个必须知道的限制：minikube 里 `type: LoadBalancer` 的 Service 的 `EXTERNAL-IP` 会一直是 `<pending>`，因为它没有云厂商的负载均衡器。要么另开一个终端跑 `minikube tunnel`，要么用 `minikube service <name>` 直接打开。kind 集群同理，需要装 MetalLB 之类的实现。

## 四、部署与滚动更新

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.27
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
        limits:
          memory: 256Mi
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 3
```

```bash
kubectl apply -f web.yaml
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web                 # 回上一版
kubectl rollout undo deployment/web --to-revision=2 # 回指定版本
```

`kubectl set image deployment/web web=nginx:1.28` 也能触发更新，但它改的是线上对象，下次 `apply` 会把文件里的旧镜像盖回去。以文件为准，改文件再 apply。

两个探针的区别直接决定可用性：

- `readinessProbe` 失败只是把 Pod 从 Service 后端摘掉，流量不再进来，容器继续运行
- `livenessProbe` 失败会**重启容器**，探针路径依赖外部服务时容易引发反复重启

`limits` 只写 `memory` 不写 `cpu` 是常见做法：内存超限被杀（`OOMKilled`），CPU 超限只是被限流，不会杀进程。

## 五、Service 与访问

| 类型 | 用途 | 前提 |
|---|---|---|
| ClusterIP | 集群内访问，默认类型 | 无 |
| NodePort | 每个节点开一个高位端口 | 端口范围默认 30000-32767 |
| LoadBalancer | 云上分配外部 IP | 云厂商或 MetalLB |
| ExternalName | 映射到外部域名 | 仅 DNS 记录 |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
```

`port` 是 Service 自身端口，`targetPort` 是容器端口。`targetPort` 与容器实际监听端口不一致，是访问不通的头号原因。

关于负载均衡，两个常见误解：

- Service 没有「轮询 / 最小连接数」这类可配策略。kube-proxy 在 iptables 模式下按概率随机转发，IPVS 模式才支持 `rr`、`lc` 等调度算法，且要在 kube-proxy 配置里显式指定。
- `sessionAffinity: ClientIP` 只做会话保持，让同一客户端落到同一 Pod，不是负载均衡策略；默认值是 `None`。

集群内访问用 DNS：`web`、`web.default`、`web.default.svc.cluster.local` 三种写法依次更明确，跨命名空间必须带命名空间名。

排查访问不通，第一步看后端有没有被选中：

```bash
kubectl get endpoints web      # ENDPOINTS 为空说明 selector 没匹配上 Pod
kubectl get pods --show-labels
```

`kubectl expose` 也能直接生成 Service，但它只带上 `port`/`targetPort` 的推断结果，后续仍要自己维护 YAML。

`Endpoints` 对象从 1.33 起标记废弃、由 `EndpointSlice` 取代，`kubectl get endpoints` 目前仍能读到汇总结果，写入侧则应该用 EndpointSlice。

## 六、配置与存储

ConfigMap 和 Secret 都可以挂成环境变量或文件：

```bash
kubectl create configmap app-config --from-file=config.yaml
kubectl create secret generic db-secret --from-literal=password='...'
```

三个限制条件必须记住：

1. **以环境变量方式注入的值不会随 ConfigMap 更新而更新**，只有重启 Pod 才生效；以卷挂载的方式会在几十秒到几分钟内同步（受 kubelet 同步周期影响），但应用要自己重新读文件。
2. **Secret 默认只是 base64 编码，不是加密**。拥有 etcd 读权限或能 `kubectl get secret -o yaml` 的人都能还原明文，生产环境需要开启 etcd 静态加密或接外部 KMS。
3. Secret 的 `data` 字段要求 base64，明文写在 `stringData` 里，提交时 kube-apiserver 会转成 base64 存储。

存储的层次是 PV（实际存储）→ PVC（申请）→ Pod 挂载：

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

手动建 PV 再用 `hostPath` 只适合单节点测试：Pod 换到别的节点就看不到原来的数据，且没有任何副本保护。生产用 StorageClass 做动态供给，PVC 声明后自动创建底层卷；`ReadWriteOnce` 的含义是「单节点读写」，不是「单 Pod 读写」，同节点多个 Pod 可以同时挂。

## 七、排查顺序

| 现象 | 先看什么 |
|---|---|
| Pod `Pending` | `kubectl describe pod` 的 Events：资源不足、污点、亲和性 |
| `ImagePullBackOff` | 镜像名与 tag 是否存在；私有仓库要配 `imagePullSecrets` |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` 看上次崩溃的日志 |
| `Running` 但没流量 | `kubectl get endpoints` 是否为空，探针是否通过 |
| Service 访问不通 | selector、`targetPort`、NetworkPolicy |
| 节点 `NotReady` | `kubectl describe node`，再看节点上 kubelet 与运行时状态 |

`kubectl describe node` 输出的是节点状态和各 Pod 的资源汇总，不是日志；节点日志要用 `journalctl -u kubelet` 在节点上查，或接入统一的日志采集。

常用调试动作：

```bash
kubectl get events --sort-by=.lastTimestamp
kubectl logs -f deploy/web --tail=50
kubectl exec -it <pod> -- sh
kubectl port-forward svc/web 8080:80
```

`kubectl exec` 进不去时，用 `kubectl debug` 起一个临时容器挂到目标 Pod 的命名空间里，镜像里没有 shell 的极简镜像只能这样查。

## 相关阅读

- [Docker 从入门到实践](/devops/docker)：镜像分层、构建与运行参数
- [Caddy 入门：自动 HTTPS 与反向代理](/devops/caddy)：集群入口的 TLS 与转发
- [Redis 原理与高可用方案](/backend/redis)：集群里的缓存与限流方案

## 参考

- [Kubernetes 组件与架构](https://kubernetes.io/docs/concepts/architecture/)
- [Service 与网络](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Secret 说明](https://kubernetes.io/docs/concepts/configuration/secret/)
- [应用故障排查](https://kubernetes.io/docs/tasks/debug/debug-application/)
