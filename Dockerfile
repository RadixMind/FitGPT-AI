# 多阶段构建 Dockerfile for FitGPT AI

# =================================================================
# 阶段 1: 依赖安装
# =================================================================
# Node 22.23.4 alpine 镜像，包含 Node.js 运行环境
FROM node:22.23.4-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 固定 pnpm 版本，避免最新版改变配置读取规则后导致 frozen lockfile 失败
RUN npm install -g pnpm@10.26.0

# 复制包管理文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile


# =================================================================
# 阶段 2: 构建应用
# =================================================================
FROM node:22.23.4-alpine AS builder
WORKDIR /app

# 与依赖安装阶段使用相同的 pnpm 版本
RUN npm install -g pnpm@10.26.0

# 从 deps 阶段复制已安装的依赖
COPY --from=deps /app/node_modules ./node_modules

# 复制源代码
COPY . .

# 设置通用构建时环境变量
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# 增加 Node.js 的内存限制, 解决构建时内存溢出问题
ENV NODE_OPTIONS=--max-old-space-size=4096

# 构建应用
RUN pnpm run build


# =================================================================
# 阶段 3: 运行时镜像 (runner)
# =================================================================
FROM node:22.23.4-alpine AS runner
WORKDIR /app

# 创建非root用户，增强安全性
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 与项目声明保持一致
RUN npm install -g pnpm@10.26.0

# 复制必要的文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 复制 Next.js 在 standalone 模式下构建的产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 设置运行时环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 启动命令
# Next.js standalone 模式下，启动文件通常在 ./server.js
CMD ["node", "server.js"]
