#!/usr/bin/env bash
# 仅构建 jamcapture 镜像，不启动容器。
set -euo pipefail

IMAGE_NAME="jamcapture"

cd "$(dirname "$0")"

echo "==> 构建镜像 $IMAGE_NAME:latest ..."
docker build -t "$IMAGE_NAME:latest" .

echo "==> 完成。"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"
