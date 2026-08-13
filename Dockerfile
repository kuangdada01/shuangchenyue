# ============================================================
# 霜晨月 Docker 镜像
# 多阶段构建：shared/server/client 编译 → 精简运行时
# 运行时需提供环境变量（JWT_SECRET/SMTP_*/ADMIN_EMAIL 等）
# 或挂载 .env 到 /app/.env
# ============================================================

# ---------- 构建阶段 ----------
FROM node:22-slim AS build
WORKDIR /app
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN cd shared && npm ci --no-audit --no-fund && npm run build
RUN cd server && npm ci --no-audit --no-fund && npm run build
RUN cd client && npm ci --no-audit --no-fund && npm run build

# ---------- 运行时阶段 ----------
FROM node:22-slim
# ffmpeg：视频转码用（缺失时服务端自动降级为原样保留，非强依赖）
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/shared ./shared
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/package-lock.json ./server/package-lock.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

RUN cd server && npm ci --omit=dev --no-audit --no-fund

# 持久化数据目录与数据库
VOLUME ["/app/server/uploads", "/app/server/books", "/app/server/mimo.db"]

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
