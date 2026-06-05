# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run generate

# ── Stage 2: Build backend native modules ────────────────────
FROM node:20-slim AS backend-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./

# Production deps only (native modules compiled here)
RUN npm ci --omit=dev

# ── Stage 3: Production image (lean) ────────────────────────
FROM node:20-slim

# ffmpeg (runtime) + tsx (runs TS directly)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g tsx

WORKDIR /app

# Pre-built node_modules (production only, native modules ready)
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY backend/package.json backend/package-lock.json ./backend/

# Backend source
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Frontend static output
COPY --from=frontend-build /app/frontend/.output/public ./frontend/dist

# Skills —— 必须落到 /app/skills，与后端 path.resolve(__dirname,'../../../skills')
# 对齐（skills.ts 在 /app/backend/src/agents 下解析为 /app/skills）。拷到 backend/skills 会导致 SKILL.md 全部加载不到。
COPY skills/ ./skills/

# Config
COPY configs/config.example.yaml ./configs/config.yaml

RUN mkdir -p data/static

# 强制用 apt 装的系统 ffmpeg（5.x，支持 apad=whole_dur / amix=normalize / subtitles 等所有滤镜选项），
# 而不是 @ffmpeg-installer 的 linux-x64 二进制（那是 2018 年的老 static build ~4.0，新选项会 "Option not found"）。
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
ENV NODE_ENV=production
ENV PORT=5679

EXPOSE 5679

# Note: no VOLUME directive — Railway rejects it. Persistent storage is provided by
# attaching a Railway Volume mounted at /app/data (or docker-compose's volume mapping locally).
CMD ["tsx", "backend/src/index.ts"]
