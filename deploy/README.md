# ClawDrama 迁移到阿里云 ECS（2C2G 也能跑）

把 app 从 Railway 迁到阿里云。核心思路：**镜像在 GitHub 上构建（内存足），2C2G 小机器只「拉镜像运行」**；ffmpeg 峰值靠 swap 兜底；媒体后续上 OSS（见 ①②，本套件先做 ③ 部署）。

> 前提：域名已备案 ✅。大陆机房 **Google 连不上**，文本模型要换国产（见最后一节）。

---

## 0. 推荐配置
- 能用：**2C2G + 系统盘 40G + 数据云盘 100G+**（挂 `/data/clawdrama`）。
- 更稳：2C4G / 2C8G。内存越大 ffmpeg 越快、越不靠 swap。

## 1. 服务器准备（一次性）
```bash
# 1) 装 Docker + compose 插件（Ubuntu 22.04）
curl -fsSL https://get.docker.com | sh
# 2) 加 4G swap（关键，防 ffmpeg OOM）
sudo bash deploy/setup-swap.sh
# 3) 挂数据云盘到 /data（示例，按你的云盘设备名 lsblk 确认）
sudo mkfs.ext4 /dev/vdb && sudo mkdir -p /data && sudo mount /dev/vdb /data
echo '/dev/vdb /data ext4 defaults 0 0' | sudo tee -a /etc/fstab
sudo mkdir -p /data/clawdrama
```

## 2. 配置 GitHub Actions 自动构建推 ACR
1. 阿里云开通**容器镜像服务 ACR**，建命名空间 + 镜像仓库 `clawdrama`，设访问凭证。
2. GitHub 仓库 → Settings → Secrets → Actions，填：
   `ACR_REGISTRY`(如 `registry.cn-shanghai.aliyuncs.com`)、`ACR_NAMESPACE`、`ACR_USERNAME`、`ACR_PASSWORD`；
   （可选自动部署）`SSH_HOST`、`SSH_USER`、`SSH_KEY`。
3. push 到 main 或手动触发 `deploy` workflow → 镜像构建好并推到 ACR。

## 3. 服务器上部署
```bash
sudo mkdir -p /opt/clawdrama && cd /opt/clawdrama
# 把 deploy/docker-compose.prod.yml 和 deploy/.env.example 传上来
cp .env.example .env && vim .env     # 填 IMAGE / JWT_SECRET / 各 API key
docker login registry.cn-shanghai.aliyuncs.com   # 用 ACR 凭证
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f   # 看启动日志
```
> 配好 GitHub Actions 的 SSH secrets 后，以后 push 即自动「构建→推→服务器拉起」，无需手动。

## 4. 域名 + HTTPS
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/clawdrama.conf
sudo vim /etc/nginx/conf.d/clawdrama.conf   # 改 your-domain.com
sudo certbot --nginx -d your-domain.com     # 自动签 + 跳 HTTPS
```
阿里云安全组放行 80/443；5679 不对外（已绑 127.0.0.1）。

## 5. 从 Railway 迁数据（SQLite + 媒体）
数据在 Railway 卷的 `/app/data`（`*.db` + `static/` 媒体）。
```bash
# 在 Railway 端（railway shell / railway ssh，若可用）做一致性备份：
sqlite3 /app/data/drama_generator.db ".backup /app/data/backup.db"
tar czf /tmp/clawdata.tgz -C /app/data backup.db static
# 下载到本地，再传到新服务器：
scp /tmp/clawdata.tgz root@新服务器IP:/data/clawdrama/
# 新服务器解开（backup.db 改回正式库名）：
cd /data/clawdrama && tar xzf clawdata.tgz && mv backup.db drama_generator.db && rm clawdata.tgz
```
> 切流前做最后一次同步（媒体是只写一次的，可先 rsync 再停机补一遍），确认无误再把域名 DNS 指到新服务器。
> 若 Railway 没有 shell：临时加一个「管理员导出 /app/data 打包下载」的路由，下完删掉。

## 6. 去 Google 化（大陆机房必须）
文本 agent（剧本改写/分镜）默认走 Gemini，大陆连不上。两条路二选一：
- **换国产文本模型**（推荐）：`.env` 里 `GOOGLE_API_KEY` 留空；在后台「AI 配置」把 text 服务改成豆包/通义/DeepSeek 之一（都是 OpenAI 兼容，填 baseUrl + key + model 即可），不用改代码。
- 或走云雾等国内聚合中转 Gemini。
Veo 兜底（`GOOGLE_VIDEO_API_KEY`）留空即可，视频主力是火山 Seedance。

## 日常更新
push 到 main → GitHub Actions 自动构建推 ACR（配了 SSH 则自动拉起）；
或手动：`cd /opt/clawdrama && docker compose -f docker-compose.prod.yml pull && up -d`。

## 备份
定期备 `/data/clawdrama`（`*.db` 用 `.backup`，`static/` 直接打包）；或挂阿里云快照。
