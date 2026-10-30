---
isTimeLine: true
title: Getting Started with Kubernetes
description: Understand Kubernetes core concepts, architecture, and principles; learn to install, configure, deploy, and manage containerized applications; and master best practices for service discovery, load balancing, configuration management, and monitoring and logging.
date: 2024-05-20
tags:
- Kubernetes
- Container Orchestration
- DevOps
categories:
- DevOps Operations
- DevOps
- Kubernetes
head:
- - meta
  - name: keywords
    content: Kubernetes,Kubernetes Beginner's Guide,Container orchestration,Kubernetes Monitoring
translatedFrom: cf6a90fe31a1c402
---
# Kubernetes Beginner's Guide

## 1. Introduction

### What Is Kubernetes?

Kubernetes (k8s for short) is an open-source container orchestration platform used to automate the deployment, scaling, and management of containerized applications. It was open-sourced by Google in 2014 and is maintained by the Cloud Native Computing Foundation (CNCF). Kubernetes provides a flexible and powerful platform for running containerized applications in various environments, from local development environments to production-grade cloud infrastructure.

### Why Choose Kubernetes?

1. **Automation**: Kubernetes can automate the deployment, scaling, and management of applications, reducing cumbersome manual operations and errors.
2. **High availability**: Through automatic restart, replication, and load balancing, it ensures high availability and stability of applications.
3. **Scalability**: Kubernetes supports horizontal scaling and can dynamically increase or decrease container instances based on application load.
4. **Flexibility**: It supports multiple environments, including public cloud, private cloud, and hybrid cloud, enabling applications to migrate seamlessly across different platforms.
5. **Community and ecosystem**: Kubernetes has a large community and a rich ecosystem, providing a large number of plugins, tools, and resources to help developers better use and extend Kubernetes.

### Main Features of Kubernetes

1. **Container orchestration**: Automates container deployment, management, scaling, and network configuration.
2. **Service discovery and load balancing**: Automatically discovers services and performs load balancing to ensure even traffic distribution.
3. **Storage orchestration**: Automatically mounts and manages storage volumes, supporting multiple storage backends.
4. **Autoscaling**: Automatically scales container instances up or down based on load, optimizing resource usage.
5. **Self-healing**: Automatically reschedules and restarts failed containers to ensure stable application operation.
6. **Configuration and secret management**: Uses ConfigMap and Secret to manage application configuration and sensitive data.

## 2. Basic Kubernetes Concepts

### Pod

A Pod is the smallest deployment unit in Kubernetes. A Pod can contain one or more containers that share network and storage resources. Pods are usually used to run a single application instance.

### Node

A Node is a worker machine in a Kubernetes cluster and can be a physical server or a virtual machine. Multiple Pods run on each Node, and they are managed by the master node.

### Cluster

A Cluster is a collection of Nodes. The master node is responsible for managing the state of the entire cluster and scheduling tasks, ensuring high availability and scalability of applications.

### Namespace

A Namespace is a logical isolation mechanism in Kubernetes used to divide cluster resources into different groups for resource management and access control.

### Deployment

A Deployment is a higher-level object used to define the desired state of an application and manage the creation, update, and deletion of Pods, ensuring the application always remains in the desired state.

### Service

A Service is an abstraction layer in Kubernetes that defines access policies for a set of Pods, provides load balancing and service discovery, and allows applications to be accessed through a fixed IP and port.

## 3. Kubernetes Architecture and Principles

![Architecture diagram](https://img.lixu.dev/rest/2024/05/vMI1meK.webp)

### Master Node

The master node is responsible for managing the state of the entire cluster and scheduling tasks. Its main components include the API server, controller manager, scheduler, and etcd storage.

### Worker Node

Worker nodes are responsible for running Pods and are managed by the master node. Their main components include kubelet and kube-proxy.

### etcd Storage

etcd is a distributed key-value store used to save all cluster state data, including node information, Pod configuration, and service discovery data.

### Controller Manager

The controller manager is responsible for managing various controllers in the cluster, such as the Replica Controller, Node Controller, and Endpoint Controller, ensuring the cluster always remains in the desired state.

### Scheduler

The scheduler is responsible for assigning newly created Pods to suitable worker nodes, ensuring rational resource utilization and load balancing.

### API Server

The API server is a core component of Kubernetes. It provides RESTful API interfaces for handling all operation requests in the cluster and communicates with etcd.

### kubelet and kube-proxy

kubelet is an agent running on each worker node. It is responsible for managing Pods on the node and ensuring they run according to the desired state. kube-proxy is responsible for managing network rules on the node, ensuring service load balancing and network communication.

## 4. Installing and Setting Up Kubernetes

### Install Minikube (Local Test Environment)

Minikube is a lightweight Kubernetes implementation suitable for local development and testing. The installation steps are as follows:

1. Download and install Minikube: https://minikube.sigs.k8s.io/docs/start/
2. Start Minikube: `minikube start`
3. Verify the installation: `kubectl get nodes`

### Install kubectl (Kubernetes Command-Line Tool)

kubectl is the Kubernetes command-line tool used to interact with the cluster. The installation steps are as follows:

1. Download and install kubectl: https://kubernetes.io/docs/tasks/tools/install-kubectl/
2. Configure kubectl to connect to Minikube: `kubectl config use-context minikube`
3. Verify the installation: `kubectl cluster-info`

## 5. Creating and Managing Pods

### Create a Pod Using `kubectl`

The following is an example of creating a simple Pod:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
  - name: my-container
    image: nginx
    ports:
    - containerPort: 80
```

Use the following command to create the Pod:

```sh
kubectl apply -f my-pod.yaml
```

### View Pod Status

Use the following command to view the Pod status:

```sh
kubectl get pods
```

### Delete a Pod

Use the following command to delete the Pod:

```sh
kubectl delete pod my-pod
```

## 6. Deploying an Application

### Create a Deployment

The following is an example of creating a Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-container
        image: nginx
        ports:
        - containerPort: 80
```

Use the following command to create the Deployment:

```sh
kubectl apply -f my-deployment.yaml
```

### Update a Deployment

Edit the Deployment configuration file, then use the following command to apply the update:

```sh
kubectl apply -f my-deployment.yaml
```

### Roll Back a Deployment

Use the following command to roll back to the previous version:

```sh
kubectl rollout undo deployment/my-deployment
```

## 7. Service Discovery and Load Balancing

### Create a Service

The following is an example of creating a Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
```

Use the following command to create the Service:

```sh
kubectl apply -f my-service.yaml
```

### Expose a Deployment

Use the following command to expose the Deployment as a Service:

```sh
kubectl expose deployment my-deployment --type=LoadBalancer --name=my-service
```

### Load Balancing Strategies

Kubernetes provides multiple load balancing strategies, such as round robin and least connections. Different strategies can be implemented by configuring the `sessionAffinity` property of a Service.

## 8. Configuration and Storage Management

### Manage Configuration Using ConfigMap and Secret

The following is an example of creating a ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1
  key2: value2
```

Use the following command to create the ConfigMap:

```sh
kubectl apply -f my-config.yaml
```

The following is an example of creating a Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
type: Opaque
data:
  username: YWRtaW4=
  password: MWYyZDFlMmU=
```

Use the following command to create the Secret:

```sh
kubectl apply -f my-secret.yaml
```

### Manage Storage Using PersistentVolume and PersistentVolumeClaim

The following is an example of creating a PersistentVolume:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /mnt/data
```

Use the following command to create the PersistentVolume:

```sh
kubectl apply -f my-pv.yaml
```

The following is an example of creating a PersistentVolumeClaim:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

Use the following command to create the PersistentVolumeClaim:

```sh
kubectl apply -f my-pvc.yaml
```
## 9. Monitoring and Logging

### Viewing Pod and Node Logs

Use the following command to view Pod logs:

```sh
kubectl logs my-pod
```

Use the following command to view node logs:

```sh
kubectl describe node my-node
```

### Monitoring with Prometheus and Grafana

Prometheus and Grafana are commonly used monitoring solutions that can be used to monitor the status and performance of a Kubernetes cluster. The following are the installation and configuration steps:

1. Install Prometheus: https://prometheus.io/docs/prometheus/latest/installation/
2. Install Grafana: https://grafana.com/docs/grafana/latest/installation/
3. Configure Prometheus to collect Kubernetes metrics: https://prometheus.io/docs/prometheus/latest/configuration/configuration/
4. Add the Prometheus data source in Grafana: https://grafana.com/docs/grafana/latest/datasources/prometheus/

## 10. Summary

Through the introduction in this article, we have learned about the basic concepts, architecture, and principles of Kubernetes, as well as how to install and configure Kubernetes, create and manage Pods, deploy applications, service discovery and load balancing, configuration and storage management, and monitoring and logging. Kubernetes provides powerful features and a flexible architecture, making it an ideal choice for modern containerized applications.

Recommended learning resources:
1. [Kubernetes Official Documentation](https://kubernetes.io/docs/home/)
2. [Kubernetes Up & Running](https://www.oreilly.com/library/view/kubernetes-up/9781491935675/)
3. [CNCF Kubernetes Courses](https://www.cncf.io/certification/training/)