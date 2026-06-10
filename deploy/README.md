# ClawDrama 迁移到火山云（云服务器 2C8G）

把 app 从 Railway 迁到火山云。**8G 内存可直接在服务器上构建**，最省事，不需要镜像仓库/CI。

> 前提：域名已备案 ✅。火山云是大陆机房，**Google 连不上**，文本模型要换国产（见最后一节）。
> 加分项：火山云和 Seedance（火山方舟）同属字节，服务器调 Seedance **同厂内网、更快更省**。

火山云名词：镜像仓库=**CR**、对象存储=**TOS**（≈阿里云 ACR/OSS）；本指南默认「服务器直接构建」，用不到 CR。

---

## 0. 配置
- 用：**2C8G + 系统盘 50G**（本地盘起步够用很久）。
- 媒体涨大/用户多了再上 **TOS + CDN**（把视频外发带宽从服务器卸掉，见最后一节）。

## 1. 服务器准备（一次性）
```bash
# Docker
curl -fsSL https://get.docker.com | sh
# 可选保险：加 swap（8G 一般用不上，但留着稳）
sudo bash deploy/setup-swap.sh
# 若单独挂了数据盘，建目录（没挂就跳过，compose 里改用 ../data）
sudo mkdir -p /data/clawdrama
```

## 2. 部署（服务器直接构建）
```bash
git clone <你的仓库> && cd huobao-drama
cp deploy/.env.example deploy/.env && vim deploy/.env   # 填 JWT_SECRET + 各 key；GOOGLE 留空
docker compose -f deploy/docker-compose.prod.yml up -d --build   # 默认用国内 npm 镜像，构建快
docker compose -f deploy/docker-compose.prod.yml logs -f
```

## 3. 域名 + HTTPS
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/clawdrama.conf
sudo vim /etc/nginx/conf.d/clawdrama.conf      # 改 your-domain.com
sudo certbot --nginx -d your-domain.com         # 自动签 + 跳 HTTPS
```
火山云安全组放行 80/443；5679 不对外（已绑 127.0.0.1）。

## 4. 从 Railway 迁数据（SQLite + 媒体）
数据在 Railway 卷 `/app/data`（`*.db` + `static/` 媒体）。
```bash
# Railway 端（railway shell/ssh 若可用）做一致性备份：
sqlite3 /app/data/drama_generator.db ".backup /app/data/backup.db"
tar czf /tmp/clawdata.tgz -C /app/data backup.db static
# 下载到本地再传到火山云服务器：
scp /tmp/clawdata.tgz root@服务器IP:/data/clawdrama/
cd /data/clawdrama && tar xzf clawdata.tgz && mv backup.db drama_generator.db && rm clawdata.tgz
```
> 切流前做最后一次同步，确认无误再把域名 DNS 指到新服务器。
> Railway 无 shell：临时加一个「管理员导出 /app/data 打包下载」路由，下完删掉。

## 5. 去 Google 化（大陆机房必须）
文本 agent（剧本改写/分镜）默认走 Gemini，大陆连不上。`.env` 里 `GOOGLE_API_KEY` 留空，
然后在后台「AI 配置」把 text 服务改成**国产**（豆包/通义/DeepSeek，OpenAI 兼容，填 baseUrl+key+model 即可），不用改代码。
Veo 兜底（`GOOGLE_VIDEO_API_KEY`）留空即可，视频主力是火山 Seedance。

## 日常更新
```bash
cd huobao-drama && git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

## 备份
定期备 `/data/clawdrama`（`*.db` 用 `.backup`，`static/` 打包）；或用火山云云盘快照。

---

## 可选 A：GitHub Actions 自动部署（不想每次手动 git pull 时）
见 `.github/workflows/deploy.yml`：GitHub 构建→推**火山云 CR**→SSH 服务器 pull 重启。
需在火山云开通 CR，并把 compose 的 `build:` 换成 `image: ${IMAGE}`（见 compose 文件末注释）。

## 可选 B：媒体上 TOS + CDN（用户多/视频访问量大时）
把生成的视频/图/音传火山云 **TOS（对象存储）**、用 **CDN 域名**分发，
让视频外发不走服务器带宽。需代码加 TOS 适配器（`@volcengine/tos-sdk`）——需要时找我做（就是「②」）。
起步阶段用本地盘即可，不必现在做。
