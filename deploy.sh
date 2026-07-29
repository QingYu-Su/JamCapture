#!/usr/bin/env bash
# 基于当前代码重新构建并覆盖旧的 jamcapture 容器。
set -euo pipefail

IMAGE_NAME="jamcapture"
CONTAINER_NAME="jamcapture"
HOST_PORT="5173"
CONTAINER_PORT="5173"

# 切到脚本所在目录（项目根），确保在任意位置执行都生效
cd "$(dirname "$0")"

echo "==> 构建镜像 $IMAGE_NAME:latest ..."
docker build -t "$IMAGE_NAME:latest" .

echo "==> 停止并移除旧容器（若存在） ..."
if [ "$(docker ps -aq -f name="^/${CONTAINER_NAME}$")" ]; then
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

echo "==> 启动新容器，监听 0.0.0.0:${HOST_PORT} ..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  --restart unless-stopped \
  "$IMAGE_NAME:latest"

echo "==> 完成。访问 http://<本机IP>:${HOST_PORT}"
docker ps --filter "name=^/${CONTAINER_NAME}$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
