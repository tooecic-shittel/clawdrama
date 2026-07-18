#!/usr/bin/env bash
# 阿里云生产部署脚本 —— 只部署 aliyun-stable 分支。
# 分流约定(2026-07-18 起):
#   main          → Railway 自动部署(实验/独立版本随便推)
#   aliyun-stable → 阿里云正式站(本脚本手动部署)
# 给阿里云发版:先把要上的提交合并/cherry-pick 到 aliyun-stable 并推送,再跑本脚本。
set -euo pipefail
cd /opt/clawdrama
git fetch origin aliyun-stable
git reset --hard FETCH_HEAD
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml up -d
sleep 5
curl -sS http://127.0.0.1:5679/api/v1/health && echo
