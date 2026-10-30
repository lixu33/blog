---
isTimeLine: true
sticky: 4
title: "Docker: From Beginner to Practice"
description: "Docker: build, ship, and run applications with ease! This article walks you through Docker's core concepts, basic commands, and hands-on examples, and explains its underlying principles in detail—helping you get started quickly and begin your containerization journey."
date: 2024-05-17
tags:
- Docker
- DevOps
- Microservices
Categories:
- Docker
- Containerization Technology
categories:
- DevOps Operations
translatedFrom: abb4caca2db0a4a4
---
# Docker Summary - From Beginner to Practice

Have you ever been overwhelmed by project environment configuration issues? Have you ever thought about packaging an application into an independent unit and deploying it easily to any machine? Docker, this open-source application container engine, perfectly solves these problems! It packages applications and dependencies into a lightweight "container," ensuring that the application runs consistently in any environment—just like putting an application into a shipping container and transporting it freely anytime, anywhere!

## 1. Docker: The Containerization Revolution in Software Development

Docker's core philosophy is "build once, run anywhere." Based on Linux container technology (LXC), it packages applications and their dependencies into an independent, portable container, and implements version control and distribution through the image mechanism.

### 1.1 Advantages of Docker:

* **Environment consistency:** Say goodbye to the awkwardness of "it works on my machine." Docker ensures that applications behave consistently in development, testing, and production environments.
* **Fast deployment:** Containers start in seconds, enabling rapid application deployment and improving development efficiency.
* **Resource isolation:** Each container has its own independent resource space and does not interfere with others, improving system security and stability.
* **Version control:** Docker images record version information for applications and dependencies, making version rollback and management convenient.
* **Lightweight and efficient:** Compared with virtual machines, Docker is more lightweight, uses fewer resources, and runs more efficiently.

### 1.2 Core Components of Docker:

* **Image:** A read-only template for an application, containing the application code, runtime environment, library files, etc. It is the basis for creating containers.
* **Container:** A running instance of an image, and an isolated, portable runtime unit.
* **Repository:** A place for storing Docker images, which can be a public repository such as Docker Hub or a private repository.
* **Daemon:** A process running in the background, responsible for managing Docker resources such as images and containers.
* **Client:** A tool for interacting with the Docker daemon, used to build, run, and manage Docker containers.

## 2. Deep Dive into Docker Principles: Unveiling the Magic of Containerization

Docker's magic lies in its clever application of Linux container technology. Let's take a look and see how Docker uses Linux kernel features to achieve the magic of containerization!

### 2.1 Linux Container Technology (LXC): The Cornerstone of Docker

Linux container technology is the cornerstone of Docker. It uses the Linux kernel's **Namespace** and **Cgroups** features to provide isolated resource spaces and control mechanisms for running processes.

* **Namespace:** Provides processes with an isolated view of system resources, including process IDs, network interfaces, mount points, etc., making processes appear to run in an independent operating system.
* **Cgroups:** Limits process usage of system resources such as CPU, memory, and IO, ensuring that containers do not excessively consume system resources and affect other applications.

### 2.2 Docker Architecture: Layered Architecture, Efficient and Flexible

Docker adopts a layered architecture, breaking the image build process into a series of layers, each of which is an incremental change to the filesystem. This layered structure brings the following advantages:

* **Image reuse:** Different images can share the same base layers, reducing storage space and download time.
* **Fast builds:** When building an image, only the layers that have changed need to be rebuilt, speeding up image builds.
* **Version control:** Each layer has a unique ID, making version management and rollback convenient.

### 2.3 Docker Images: The Build Blueprint for Containers

A Docker image is a read-only template containing everything needed to run an application: the filesystem, libraries, environment variables, and configurations. It uses Union FS (Union File System) technology to overlay multiple filesystem layers into a unified view.

### 2.4 Docker Containers: Running Instances of Images

A Docker container is a running instance of a Docker image and is a lightweight, isolated runtime environment. When we run a container, Docker creates a new Linux container, loads the image into the container, and starts the application process.

### 2.5 Docker Repositories: Storage and Distribution Centers for Images

Docker repositories are used to store and distribute Docker images and can be public repositories such as Docker Hub or private repositories. Users can push their own built images to a repository and can also pull images built by others from a repository.

## 3. Docker Basic Commands: Your Containerization Tools

Mastering Docker starts with becoming familiar with common commands!

| Command       | Description                                           |
| ---------- | ---------------------------------------------- |
| docker version | View Docker version information                         |
| docker search | Search for images on Docker Hub                     |
| docker pull   | Download images from a repository                               |
| docker images  | List local images                                   |
| docker run   | Create and start a container                               |
| docker ps    | List running containers                           |
| docker stop  | Stop a container                                       |
| docker restart | Restart a container                                       |
| docker kill  | Force stop a container                                   |
| docker rm    | Delete a container                                       |
| docker rmi   | Delete an image                                       |
| docker build  | Build an image using a Dockerfile                 |
| docker exec  | Execute commands in a running container                     |
| docker logs  | View container logs                                   |

## 4. Dockerfile: Customize Your Own Image

A Dockerfile is a text file containing instructions for building a Docker image, like a blueprint for building an application.

### 4.1 Example: Building a Node.js Application Image

```dockerfile
# 使用 Node.js 24 (LTS) 作为基础镜像
FROM node:24

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "app.js"]
```

### 4.2 Explanation:

1. `FROM node:24`: Specify the base image. Here, the official Node.js 24 (LTS) image is used.
2. `WORKDIR /app`: Set the working directory inside the container to `/app`; subsequent commands are executed in this directory.
3. `COPY package*.json ./`: Copy the `package.json` and `package-lock.json` files to the working directory for installing dependencies.
4. `RUN npm install`: Execute the `npm install` command in the container to install application dependencies.
5. `COPY . .`: Copy all files from the current directory (the directory containing the Dockerfile) to the container working directory.
6. `EXPOSE 3000`: Declare the port that the container listens on at runtime. Here, port 3000, commonly used by Node.js applications, is exposed.
7. `CMD ["node", "app.js"]`: Specify the command executed when the container starts. Here, `npm start` is used to start the Node.js application.

## 5. Docker in Practice: Build Your First Node.js Application

Next, we will use a simple Node.js application to demonstrate how to use Docker to build, run, and manage applications.

### 5.1 Create a Node.js Application

```javascript
// app.js
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello from Docker!');
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
```

### 5.2 Create a Dockerfile

Create a `Dockerfile` in the project root directory with the following content:

```dockerfile
# 使用 Node.js 24 (LTS) 作为基础镜像
FROM node:24

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json 文件到工作目录
COPY package*.json ./

# 安装应用程序依赖
RUN npm install

# 复制应用程序代码到工作目录
COPY . .

# 暴露应用程序端口
EXPOSE 3000

# 定义启动命令
CMD ["node", "app.js"]
```

### 5.3 Build the Image

In the terminal, go to the directory containing the Dockerfile and run the following command to build the image:

```bash
docker build -t my-node-app .
```

The `-t` parameter is used to specify the image name, which is named `my-node-app` here. `.` indicates the current directory where the Dockerfile is located.

### 5.4 Run the Container

After the image is built, run the following command to run the container:

```bash
docker run -d -p 8080:3000 my-node-app
```

*   The `-d` parameter indicates running the container in background mode.
*   `-p 8080:3000` maps port 8080 on the host to port 3000 in the container, so you can access the application by visiting port 8080 on the host.

### 5.5 Access the Application

Open your browser and visit `http://localhost:8080`. You will see the page “Hello from Docker!” Congratulations, you have successfully run your first Node.js application using Docker!

## 6. Docker: The Cornerstone of the Cloud-Native Era

Docker is not just a tool, but a philosophy. It has driven the development of microservice architecture and cloud-native applications. The convenience, efficiency, and portability of Docker container technology make it an important cornerstone for building modern applications.

### 6.1 Docker and Microservices:

Docker is naturally suited to microservice architecture. Each microservice can be packaged into an independent container, enabling service isolation, independent deployment, and scaling.

### 6.2 Docker and Cloud Native:

Docker is an important infrastructure for cloud-native applications. Major cloud platforms provide support for Docker, making it easy for users to quickly deploy and manage applications.

## 7. Summary: Start Your Docker Journey

Docker has brought revolutionary changes to software development. It simplifies application deployment and improves development efficiency, making it a powerful tool that every developer should master. This article is only an introductory guide to Docker, and more exciting content awaits your exploration!

## 8. Reference Resources

* Docker official documentation: [https://docs.docker.com/](https://docs.docker.com/)
* Docker Hub: [https://hub.docker.com/](https://hub.docker.com/)