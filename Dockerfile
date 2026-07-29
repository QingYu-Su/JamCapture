FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖描述文件以利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装全部依赖（vite 在 devDependencies 中，preview 运行时需要）
RUN npm ci

# 拷贝源代码与 config.yaml（运行时必需）
COPY . .

# 构建生产产物到 dist/
RUN npm run build

# 容器内监听 5173
EXPOSE 5173

# 使用 vite preview 提供静态资源 + murekaProxy 中间件
# --host 0.0.0.0 让服务监听所有网卡，--port 5173 锁定端口
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
