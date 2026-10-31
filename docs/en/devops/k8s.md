---
isTimeLine: true
title: Kubernetes Getting Started Guide
description: "Starting from object hierarchy: how Deployment manages ReplicaSets and Pods, the division of responsibilities among control plane components, why external addresses remain pending in local clusters, the four Service exposure methods and in-cluster DNS resolution, the limitation that Secret objects are only encoded and not encrypted, and the troubleshooting order and common rollback commands when containers are stuck pending scheduling or repeatedly restarting."
date: 2024-05-20
updated: 2026-10-31
tags:
- Kubernetes
- Container orchestration
- DevOps
categories:
- DevOps Operations
- Kubernetes
head:
- - meta
  - name: keywords
    content: Kubernetes,k8s,Container orchestration,Deployment,Service,ConfigMap,Secret,Pod troubleshooting
translatedFrom: c8987e85aeb73603
---
# Getting Started with Kubernetes

Running services with Compose on a few machines means that when one machine goes down, you have to manually move containers to another; when traffic grows, you also have to edit the Nginx upstream to add backends. Kubernetes hands these actions to controllers to complete automatically, at the cost of first accepting its object model and changing the habit of "logging into a machine to look at processes."

Below starts from object relationships and the reconciliation loop, then covers control plane components, a local cluster, how to write Deployment and Service, configuration storage, and finally the troubleshooting order when a Pod won't start.

## First, Clarify Four Relationships

1. **Deployment → ReplicaSet → Pod** is a three-level nesting. To change the image, change the Deployment's Pod template; changing a Pod directly will be recreated by the ReplicaSet according to the template.
2. **Service selects Pods through label selector**, and does not record IPs. After a Pod is recreated its IP changes, but the Service's cluster IP does not.
3. **Everything is declarative**: objects describe the desired state, and controllers continuously pull the actual state back to the desired state (reconcile); you do not need to issue a "start" command.
4. **Pod is the smallest scheduling unit**. Containers in the same Pod share a network namespace and access each other via `localhost`, but their lifecycles are tied together.

## I. Core Objects

| Object | Purpose | Key Point |
|---|---|---|
| Pod | Smallest deployment unit; one or more containers sharing a network | Generally not created directly |
| Deployment | Manages replicas and rolling updates | Preferred for stateless applications |
| StatefulSet | Replicas with ordered, stable network identities | Stateful scenarios such as databases |
| DaemonSet | One per node | Log collection, network plugins |
| Service | Provides a fixed access entry for a group of Pods | Associated via selector |
| Ingress | Layer 7 routing, distributes by domain/path | Requires an Ingress Controller |
| ConfigMap / Secret | Configuration and sensitive data | Secret is only encoded by default |
| Namespace | Logical isolation and quota boundary | Does not isolate the network; requires NetworkPolicy |

`Job` and `CronJob` are for run-to-completion tasks; the former is one-off, the latter is scheduled by cron expression.

## II. Control Plane and Worker Nodes

Official documentation has long stopped using the master naming; now it is called the control plane and worker nodes.

| Component | Location | Responsibility |
|---|---|---|
| kube-apiserver | Control plane | The sole read/write entry point; validates requests and writes to etcd |
| etcd | Control plane | Stores all cluster state; only apiserver accesses it directly |
| kube-scheduler | Control plane | Selects nodes for new Pods |
| kube-controller-manager | Control plane | Runs various controllers, including node, endpoint, and replica controllers |
| kubelet | Every node | Starts containers according to PodSpec and reports status |
| kube-proxy | Every node | Maintains Service forwarding rules |
| Container runtime | Every node | containerd, etc.; actually runs containers |

A few easily confused points:

- **kubelet is not responsible for container networking**; IP allocation and cross-node connectivity are implemented by CNI plugins (Calico, Cilium, Flannel). If the cluster has no CNI installed, Pods will remain `Pending` or `ContainerCreating`.
- **Scheduling only looks at requests, not actual usage**. When a Pod does not specify `resources.requests`, the scheduler calculates it as 0, which can lead to overcommit and node OOM.
- Things like the replica controller and endpoint controller are packaged into the single `kube-controller-manager` process and do not need to be deployed separately.
- A highly available deployment requires at least 3 control plane nodes. etcd uses Raft and requires a majority to be alive in order to write.

## III. Start a Local Cluster

minikube is the fastest way to start a single-machine cluster; Docker or another driver must be installed first:

```bash
minikube start --cpus=4 --memory=8g --driver=docker
kubectl get nodes
kubectl cluster-info
```

Install `kubectl` separately. minikube writes the context into `~/.kube/config`; switch with `kubectl config use-context minikube`.

One limitation you must know: in minikube, the `EXTERNAL-IP` of a Service with `type: LoadBalancer` will always be `<pending>`, because there is no cloud provider load balancer. Either run `minikube tunnel` in another terminal, or use `minikube service <name>` to open it directly. The same applies to kind clusters; an implementation such as MetalLB needs to be installed.

## IV. Deployment and Rolling Updates

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

`kubectl set image deployment/web web=nginx:1.28` can also trigger an update, but it modifies the live object; the next `apply` will overwrite it with the old image in the file. Treat the file as the source of truth: modify the file and then apply.

The difference between the two probes directly determines availability:

- A failed `readinessProbe` only removes the Pod from the Service backend, so traffic no longer comes in, while the container continues to run
- A failed `livenessProbe` **restarts the container**; when the probe path depends on external services, this can easily cause repeated restarts

Specifying only `memory` and not `cpu` in `limits` is a common practice: exceeding the memory limit gets the process killed (`OOMKilled`), while exceeding the CPU limit only gets it throttled and does not kill the process.

## V. Service and Access

| Type | Purpose | Prerequisite |
|---|---|---|
| ClusterIP | Access within the cluster, default type | None |
| NodePort | Opens a high-numbered port on each node | Port range defaults to 30000-32767 |
| LoadBalancer | Allocates an external IP on the cloud | Cloud provider or MetalLB |
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

`port` is the Service's own port, and `targetPort` is the container port. A mismatch between `targetPort` and the port the container actually listens on is the number one cause of inaccessible services.

Regarding load balancing, two common misunderstandings:

- Service has no configurable policy such as "round robin / least connections". In iptables mode, kube-proxy forwards randomly by probability; only IPVS mode supports scheduling algorithms such as `rr` and `lc`, and they must be explicitly specified in the kube-proxy configuration.
- `sessionAffinity: ClientIP` only provides session affinity, making the same client land on the same Pod; it is not a load balancing policy. The default value is `None`.

Access within the cluster uses DNS: `web`, `web.default`, and `web.default.svc.cluster.local` become progressively more explicit, and cross-namespace access must include the namespace name.

To troubleshoot inaccessible services, the first step is to check whether the backend is selected:

```bash
kubectl get endpoints web      # ENDPOINTS 为空说明 selector 没匹配上 Pod
kubectl get pods --show-labels
```

`kubectl expose` can also generate a Service directly, but it only includes inferred results for `port`/`targetPort`; you still need to maintain the YAML yourself afterward.

The `Endpoints` object has been marked deprecated since 1.33 and is replaced by `EndpointSlice`. `kubectl get endpoints` can still read aggregated results for now, but the write side should use EndpointSlice.

## 6. Configuration and Storage

Both ConfigMap and Secret can be mounted as environment variables or files:

```bash
kubectl create configmap app-config --from-file=config.yaml
kubectl create secret generic db-secret --from-literal=password='...'
```

Three limitations to remember:

1. **Values injected as environment variables do not update when the ConfigMap is updated**; they take effect only after the Pod is restarted. Values mounted as volumes are synchronized within tens of seconds to a few minutes (depending on the kubelet sync period), but the application must reread the file itself.
2. **By default, Secrets are only base64-encoded, not encrypted**. Anyone with read access to etcd or who can run `kubectl get secret -o yaml` can recover the plaintext. In production, enable etcd encryption at rest or integrate an external KMS.
3. The `data` field of a Secret requires base64; plaintext is written in `stringData`, and the kube-apiserver converts it to base64 for storage when submitted.

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

Manually creating a PV and then using `hostPath` is only suitable for single-node testing: if the Pod moves to another node, it cannot see the original data, and there is no replica protection. In production, use a StorageClass for dynamic provisioning; after a PVC is declared, the underlying volume is created automatically. `ReadWriteOnce` means "single-node read-write", not "single-Pod read-write"; multiple Pods on the same node can mount it simultaneously.

## 7. Troubleshooting Order

| Symptom | What to check first |
|---|---|
| Pod `Pending` | Events from `kubectl describe pod`: insufficient resources, taints, affinity |
| `ImagePullBackOff` | Whether the image name and tag exist; private registries require `imagePullSecrets` |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` to view logs from the previous crash |
| `Running` but no traffic | Whether `kubectl get endpoints` is empty, and whether probes pass |
| Service unreachable | selector, `targetPort`, NetworkPolicy |
| Node `NotReady` | `kubectl describe node`, then check kubelet and runtime status on the node |

`kubectl describe node` outputs node status and resource summaries for each Pod, not logs; for node logs, use `journalctl -u kubelet` on the node or integrate centralized log collection.

Common debugging actions:

```bash
kubectl get events --sort-by=.lastTimestamp
kubectl logs -f deploy/web --tail=50
kubectl exec -it <pod> -- sh
kubectl port-forward svc/web 8080:80
```

When you cannot get in with `kubectl exec`, use `kubectl debug` to start an ephemeral container attached to the target Pod's namespace; this is the only way to troubleshoot minimal images that do not contain a shell.

## Related Reading

- [Docker from Beginner to Practice](/en/devops/docker): image layers, build and runtime parameters
- [Caddy Basics: Automatic HTTPS and Reverse Proxy](/en/devops/caddy): TLS and forwarding at the cluster ingress
- [Redis Principles and High Availability Solutions](/en/backend/redis): caching and rate limiting in the cluster

## References

- [Kubernetes Components and Architecture](https://kubernetes.io/docs/concepts/architecture/)
- [Services and Networking](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)