---
isTimeLine: true
title: Kubernetes Beginner's Guide
description: "Starting with object hierarchy: how Deployments manage ReplicaSets and Pods, the division of responsibilities among control plane components, why external addresses stay pending in local clusters, Service’s four exposure methods and in-cluster DNS resolution, the limitation that Secret objects are only encoded and not encrypted, and the troubleshooting order and common rollback commands for containers stuck waiting for scheduling or repeatedly restarting."
date: 2024-05-20
updated: 2026-10-31
tags:
- Kubernetes
- Container Orchestration
- DevOps
categories:
- DevOps Operations
- Kubernetes
head:
- - meta
  - name: keywords
    content: Kubernetes,k8s,Container Orchestration,Deployment,Service,ConfigMap,Secret,Pod Troubleshooting
translatedFrom: 85e62972fa98ad90
---
# Kubernetes Getting Started Guide

Running services with Compose on a few machines means manually moving containers to another machine when one goes down, and editing the Nginx upstream to add backends when traffic increases. Kubernetes hands these actions to controllers to complete automatically, at the cost of first accepting its object model and breaking the habit of "logging into the machine to look at processes."

The following starts with object relationships and the reconciliation loop, then moves on to control plane components, a local cluster, how to write Deployments and Services, configuration storage, and finally the troubleshooting order when a Pod won't start.

## First, Clarify Four Relationships

1. **Deployment → ReplicaSet → Pod** is a three-level nesting. To change the image, change the Deployment's Pod template; if you modify a Pod directly, the ReplicaSet will recreate it according to the template.
2. **A Service selects Pods through label selectors**, not by remembering IPs. After a Pod is recreated, its IP changes, but the Service's cluster IP remains unchanged.
3. **Everything is declarative**: objects describe the desired state, and controllers continuously reconcile the actual state back to the desired state; you do not need to issue a "start" command.
4. **A Pod is the smallest scheduling unit**. Containers in the same Pod share a network namespace and can reach each other via `localhost`, but their lifecycles are tied together.

## 1. Core Objects

| Object | Purpose | Key Point |
|---|---|---|
| Pod | Smallest deployment unit; one or more containers sharing a network | Generally not created directly |
| Deployment | Manages replicas and rolling updates | Preferred for stateless applications |
| StatefulSet | Replicas with ordered, stable network identities | Stateful scenarios such as databases |
| DaemonSet | Runs one copy on each node | Log collection, network plugins |
| Service | Provides a stable access entry point for a group of Pods | Associated via selectors |
| Ingress | Layer 7 routing, distributing by domain/path | Requires an Ingress Controller |
| ConfigMap / Secret | Configuration and sensitive data | Secrets are only encoded by default |
| Namespace | Logical isolation and quota boundary | Does not isolate networking; NetworkPolicy is required |

`Job` and `CronJob` are used for run-to-completion tasks; the former is one-off, while the latter is scheduled by cron expression.

## 2. Control Plane and Worker Nodes

Official documentation has long stopped using the term master; it now calls them the control plane and worker nodes.

| Component | Location | Responsibility |
|---|---|---|
| kube-apiserver | Control plane | The sole read/write entry point; validates requests before writing to etcd |
| etcd | Control plane | Stores all cluster state; only the apiserver accesses it directly |
| kube-scheduler | Control plane | Selects nodes for new Pods |
| kube-controller-manager | Control plane | Runs various controllers, including node, endpoint, and replica controllers |
| kubelet | Each node | Starts containers according to the PodSpec and reports status |
| kube-proxy | Each node | Maintains forwarding rules for Services |
| Container runtime | Each node | containerd, etc.; actually runs containers |

A few points that are easy to confuse:

- **kubelet is not responsible for container networking**. IP allocation and cross-node connectivity are implemented by CNI plugins (Calico, Cilium, Flannel). If no CNI is installed in the cluster, Pods will remain in `Pending` or `ContainerCreating`.
- **Scheduling only looks at requests, not actual usage**. When a Pod does not specify `resources.requests`, the scheduler calculates it as 0, which can lead to overcommit and node OOM.
- Things like the replica controller and endpoint controller are all packaged into the single `kube-controller-manager` process and do not need to be deployed separately.
- A high-availability deployment requires at least 3 control plane nodes; etcd uses Raft and needs a majority alive to write.

## 3. Start a Local Cluster

minikube is the fastest way to start a single-machine cluster; you need to install Docker or another driver first:

```bash
minikube start --cpus=4 --memory=8g --driver=docker
kubectl get nodes
kubectl cluster-info
```

`kubectl` is installed separately. minikube writes the context into `~/.kube/config`; switch to it with `kubectl config use-context minikube`.

One limitation you must know: in minikube, a Service with `type: LoadBalancer` will always have `EXTERNAL-IP` as `<pending>`, because there is no cloud provider load balancer. Either run `minikube tunnel` in another terminal, or open it directly with `minikube service <name>`. The same applies to kind clusters; you need to install an implementation such as MetalLB.

## 4. Deployment and Rolling Updates

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

`kubectl set image deployment/web web=nginx:1.28` can also trigger an update, but it modifies the live object. The next `apply` will overwrite it with the old image from the file. Treat the file as the source of truth: change the file, then apply.

The difference between the two probes directly determines availability:

- A failed `readinessProbe` only removes the Pod from the Service backends; traffic stops coming in, and the container keeps running.
- A failed `livenessProbe` **restarts the container**; when the probe path depends on external services, this can easily cause repeated restarts.

It is common practice to specify only `memory` and not `cpu` under `limits`: exceeding the memory limit causes the process to be killed (`OOMKilled`), while exceeding the CPU limit only throttles it and does not kill the process.

## 5. Service and Access

| Type | Use | Prerequisite |
|---|---|---|
| ClusterIP | Access within the cluster; default type | None |
| NodePort | Opens a high-numbered port on each node | Default port range is 30000-32767 |
| LoadBalancer | Allocates an external IP in the cloud | Cloud provider or MetalLB |
| ExternalName | Maps to an external domain name | DNS record only |

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

`port` is the Service's own port, and `targetPort` is the container port. A mismatch between `targetPort` and the port the container actually listens on is the number one cause of access failures.

Two common misunderstandings about load balancing:

- A Service has no configurable strategy such as "round robin / least connections". In iptables mode, kube-proxy forwards randomly by probability; only IPVS mode supports scheduling algorithms such as `rr` and `lc`, and they must be explicitly specified in the kube-proxy configuration.
- `sessionAffinity: ClientIP` only performs session affinity, making the same client land on the same Pod; it is not a load balancing strategy. The default value is `None`.

Use DNS for in-cluster access: `web`, `web.default`, and `web.default.svc.cluster.local` are increasingly explicit; cross-namespace access must include the namespace name.

When troubleshooting access failures, the first step is to check whether the backends have been selected:

```bash
kubectl get endpoints web      # ENDPOINTS 为空说明 selector 没匹配上 Pod
kubectl get pods --show-labels
```

`kubectl expose` can also generate a Service directly, but it only includes inferred `port`/`targetPort` results; you still need to maintain the YAML yourself afterward.

The `Endpoints` object has been marked deprecated since 1.33 and is replaced by `EndpointSlice`. `kubectl get endpoints` can still read aggregated results for now, but the write side should use EndpointSlice.

## 6. Configuration and Storage

ConfigMap and Secret can both be mounted as environment variables or files:

```bash
kubectl create configmap app-config --from-file=config.yaml
kubectl create secret generic db-secret --from-literal=password='...'
```

Three constraints must be remembered:

1. **Values injected as environment variables do not update when the ConfigMap updates**; they take effect only after the Pod restarts. Volume mounts synchronize within tens of seconds to a few minutes (depending on the kubelet sync period), but the application must reread the file itself.
2. **By default, Secret is only base64-encoded, not encrypted**. Anyone with etcd read access or who can run `kubectl get secret -o yaml` can recover the plaintext. Production environments need etcd encryption at rest enabled or an external KMS integrated.
3. The `data` field of a Secret requires base64; write plaintext in `stringData`, and kube-apiserver converts it to base64 for storage on submission.

The storage hierarchy is PV (actual storage) → PVC (request) → Pod mount:

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

Manually creating a PV and then using `hostPath` is only suitable for single-node testing: if the Pod moves to another node, it cannot see the original data, and there is no replica protection. In production, use a StorageClass for dynamic provisioning; after a PVC is declared, the underlying volume is created automatically. `ReadWriteOnce` means "read-write by a single node," not "read-write by a single Pod"; multiple Pods on the same node can mount it simultaneously.

## 7. Troubleshooting Order

| Symptom | What to check first |
|---|---|
| Pod `Pending` | Events from `kubectl describe pod`: insufficient resources, taints, affinity |
| `ImagePullBackOff` | Whether the image name and tag exist; for a private registry, configure `imagePullSecrets` |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` to see logs from the previous crash |
| `Running` but no traffic | Whether `kubectl get endpoints` is empty; whether probes pass |
| Service unreachable | selector, `targetPort`, NetworkPolicy |
| Node `NotReady` | `kubectl describe node`, then check kubelet and runtime status on the node |

`kubectl describe node` outputs node status and a resource summary of each Pod, not logs; node logs must be checked on the node with `journalctl -u kubelet`, or collected through centralized logging.

Common debugging actions:

```bash
kubectl get events --sort-by=.lastTimestamp
kubectl logs -f deploy/web --tail=50
kubectl exec -it <pod> -- sh
kubectl port-forward svc/web 8080:80
```

When you cannot get into a container with `kubectl exec`, use `kubectl debug` to start an ephemeral container attached to the target Pod's namespaces; minimal images with no shell can only be investigated this way.

## References

- [Kubernetes Components and Architecture](https://kubernetes.io/docs/concepts/architecture/)
- [Service and Networking](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Secret Documentation](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Application Troubleshooting](https://kubernetes.io/docs/tasks/debug/debug-application/)