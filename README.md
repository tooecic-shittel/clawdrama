# 🎬 ClawDrama · 爪爪短剧

<div align="center">

<img src="frontend/public/claw-logo.svg" alt="ClawDrama" width="120" />

**基于 TypeScript 全栈的 AI 短剧自动化生产平台**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [部署指南](#-部署指南) • [积分系统](#-积分系统)

</div>

---

## 📖 项目简介

**ClawDrama** 是一个基于 AI 的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

> **本项目基于 [chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama) 二次开发**，遵循原项目 CC BY-NC-SA 4.0 许可证。

### 🎯 核心价值

- **🤖 AI 驱动**：大语言模型解析剧本，提取角色、场景和分镜
- **🎨 智能创作**：AI 绘图生成角色形象与场景背景
- **📹 视频生成**：文生视频 + 图生视频自动生成分镜
- **🔄 完整工作流**：从剧本到成片，一站式完成
- **💳 积分计费**：用户充值积分消耗 AI 算力，省心计费

### 🛠️ 技术架构

```
frontend/   — Nuxt 3 + Vue 3 + TypeScript（纯 CSS，无 UI 框架）
backend/    — Hono + Drizzle ORM + Mastra Agents + better-sqlite3
configs/    — config.yaml 配置文件
data/       — SQLite 数据库 + 生成资源文件
skills/     — Agent 技能定义 (SKILL.md)
```

---

## ✨ 功能特性

### 🎭 角色管理
- ✅ AI 生成角色形象（批量生成）
- ✅ 角色图片上传与管理
- ✅ 角色音色分配与试听

### 🎬 分镜制作
- ✅ AI 自动拆解分镜脚本
- ✅ 场景描述与镜头设计
- ✅ 分镜图片生成（文生图）
- ✅ 宫格图生成、切分与分配
- ✅ 帧类型选择（首帧 / 尾帧 / 分镜板）

### 🎥 视频生成
- ✅ 图生视频自动生成
- ✅ TTS 配音生成
- ✅ FFmpeg 单镜头合成（视频 + 音频 + 字幕）
- ✅ 整集拼接导出

### 🔐 账号与积分系统
- ✅ JWT 登录鉴权（首位注册者自动为管理员）
- ✅ 注册赠送积分（默认 200）
- ✅ 积分余额 + 流水记录
- ✅ 管理员后台手动充值
- ✅ 三档套餐目录（500 / 1500 / 5000）

### 🤖 AI Agents

内置 5 个 Mastra Agent：

| Agent | 职责 |
|---|---|
| `script_rewriter` | 小说 → 格式化剧本改写 |
| `extractor` | 角色 + 场景智能提取与去重 |
| `storyboard_breaker` | 剧本 → 分镜序列拆解 |
| `voice_assigner` | 角色音色自动分配 |
| `grid_prompt_generator` | 角色 / 场景 / 宫格图提示词生成 |

### 🔌 多厂商适配

| 类型 | 支持厂商 |
|---|---|
| **图片** | OpenAI、Gemini、MiniMax、火山引擎、阿里、Chatfire |
| **视频** | MiniMax、火山引擎 / Seedance、Vidu、阿里 |
| **TTS** | MiniMax |

---

## 🚀 快速开始

### 📋 环境要求

| 软件 | 版本要求 |
|---|---|
| **Node.js** | 20+ |
| **npm** | 9+ |
| **FFmpeg** | 4.0+（视频处理必需） |

#### 安装 FFmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Windows: https://ffmpeg.org/download.html
```

### 🧩 配置

```bash
cp configs/config.example.yaml configs/config.yaml
```

`configs/config.yaml` 示例：

```yaml
server:
  port: 5679
  host: "0.0.0.0"
  cors_origins:
    - "http://localhost:3013"

database:
  type: "sqlite"
  path: "./data/huobao_drama.db"

storage:
  type: "local"
  local_path: "./data/storage"
  base_url: "http://localhost:5679/static"
```

> AI 服务的具体 API Key 与模型参数在 Web 端「设置」页配置（数据库存储）。

### 📥 安装 + 启动

```bash
# 1. 克隆
git clone https://github.com/tooecic-shittel/clawdrama.git
cd clawdrama

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 3. 启动（两个终端）
# 终端 1
cd backend && npm run dev

# 终端 2
cd frontend && npm run dev
```

- 前端：`http://localhost:3013`
- 后端 API：`http://localhost:5679/api/v1`
- 前端自动代理 `/api` 和 `/static` 到后端

### 👤 首次使用

1. 打开 `http://localhost:3013` → 点「免费注册」
2. **第一个注册的账号自动成为管理员**（可发放积分）
3. 进入「设置」→「AI 服务配置」→ 用「一键配置」快速填入 chatfire 全链路 Key
4. 回到「项目」页 → 新建短剧

---

## 💳 积分系统

注册后用户拥有积分余额，未来用于消费 AI 算力。

| 操作 | 说明 |
|---|---|
| 查看余额 | 顶栏绿色芯片 / `/credits` 页 |
| 注册赠送 | 默认 200 积分（可配置） |
| 管理员充值 | `/credits` 页底部「管理员后台」表单 |
| 流水查询 | `/credits` 页底部「流水记录」列表 |

**API 端点**

```
GET  /api/v1/credits/balance     — 当前用户余额
GET  /api/v1/credits/history     — 流水（最近 50 条）
GET  /api/v1/credits/packages    — 套餐目录
POST /api/v1/credits/grant       — admin only：手动充值
GET  /api/v1/credits/users       — admin only：用户列表
```

---

## 📦 部署指南

### 🐳 Docker（推荐）

```bash
docker compose up -d
docker compose logs -f
```

或者用单容器：

```bash
docker build -t clawdrama:latest .
docker run -d \
  --name clawdrama \
  -p 5679:5679 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs/config.yaml:/app/configs/config.yaml \
  clawdrama:latest
```

> Linux 用户访问宿主机 Ollama 需加 `--add-host=host.docker.internal:host-gateway`

### 🏭 传统部署

```bash
cd frontend && npm run generate && cd ..
cd backend && npm start
```

需要上传到服务器的：

```
backend/          # 后端源码 + node_modules
frontend/dist/    # 前端构建产物
configs/config.yaml
data/             # 首次运行自动创建
skills/           # Agent 技能文件
```

#### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🎨 技术栈

### 后端
- **运行时**: Node.js 20+
- **Web 框架**: Hono
- **ORM**: Drizzle ORM + better-sqlite3
- **AI Agent**: Mastra + AI SDK（OpenAI compatible）
- **鉴权**: hono/jwt（HS256） + bcryptjs
- **视频处理**: FFmpeg（fluent-ffmpeg）
- **图片处理**: Sharp

### 前端
- **框架**: Nuxt 3（SPA 模式）
- **语言**: Vue 3 + TypeScript
- **路由**: 文件路由（Vue Router 4）
- **样式**: 纯 CSS + CSS Variables
- **图标**: Lucide Vue

---

## 📝 常见问题

### Q: 第一次访问需要注册吗？
A: 是。**首位注册者自动成为管理员**，可以在 `/credits` 页手动给其他用户充值积分。

### Q: 忘记 admin 密码怎么办？
A: 当前没有"忘记密码"流程，可以直接清空数据库重来：删掉 `data/huobao_drama.db*`，重启后端，重新注册。

### Q: 怎么把项目分享给朋友看？
A: 用 `ssh -R 80:localhost:3013 nokey@localhost.run` 拿到一个 lhr.life 公网链接（需在 `frontend/nuxt.config.ts` 的 `vite.server.allowedHosts: true`，本项目已配置）。

### Q: Docker 容器如何访问宿主机的 Ollama？
A: 用 `http://host.docker.internal:11434/v1` 作为 Base URL，Linux 需加 `--add-host=host.docker.internal:host-gateway`。

### Q: FFmpeg 未安装？
A: 视频合成会失败。运行 `ffmpeg -version` 验证。Docker 部署已内置 FFmpeg。

---

## 🙏 致谢

本项目基于 [**chatfire-AI / huobao-drama**](https://github.com/chatfire-AI/huobao-drama) 二次开发，特别感谢原作者：

- 完整的 AI 短剧生产工作流设计
- Mastra Agent + 多厂商适配的架构基础
- Nuxt 3 + Hono + SQLite 技术栈选型

原项目采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可证，本项目同样遵循。

---

## 📄 License

CC BY-NC-SA 4.0 — 署名 - 非商业性使用 - 相同方式共享

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star！**

Made with 🐾 by ClawDrama

</div>
