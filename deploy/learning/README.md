# 学习中心运营与部署说明

学习卡在抖音、淘宝等电商平台销售；平台负责定价、收款、订单、发货与退款。
爪爪短剧网站只负责：兑换码批次生成、兑换、课程权限、随课积分与课程交付。
**网站不显示课程价格、没有站内购买入口，请勿在任何迭代中加入。**

## 服务器文件布局

课程大视频与下载资料不进 Git，放在数据盘：

```
/data/clawdrama/learning/aigc-short-drama-v1/
├── videos/
│   ├── lesson-01.mp4
│   ├── lesson-02.mp4
│   ├── ... 
│   └── lesson-08.mp4
└── downloads/
    ├── lesson-01-工作流全景图.pdf
    ├── lesson-01-开课准备清单.pdf
    ├── lesson-02-剧本模板.docx
    └── ...（文件名必须与课程目录 learning-catalog.ts 中 downloads 完全一致）
```

完整文件清单见 `aigc-short-drama-v1-file-list.txt`。

**视频规格要求**：H.264 + AAC 的 MP4，faststart（moov 前置，保证边下边播）：

```bash
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -movflags +faststart lesson-01.mp4
```

容器内该目录挂载为 `/app/data/learning`（compose 里 `/data/clawdrama:/app/data`），
`LEARNING_DATA_DIR` 已在 docker-compose.prod.yml 指向容器内路径，不需要手工改。

## 环境变量（deploy/.env）

```env
# 兑换码 HMAC 密钥：至少 32 字节随机值，只放生产环境变量，绝不提交 Git。
# 生成：openssl rand -hex 32
# ⚠️ 一旦有用户兑换过就不能再更换（换了所有未兑换码全部失效）。
REDEMPTION_CODE_PEPPER=

# 每张学习卡默认随课积分（创建批次时可改，兑换按批次快照发放）
LEARNING_CARD_DEFAULT_CREDITS=30000

# 微信群与直播入口（留空则前端隐藏对应入口）
LEARNING_WECHAT_URL=
LEARNING_LIVE_URL=
```

## 发布流程

1. 备份生产 SQLite：`cp /data/clawdrama/huobao_drama.db /data/clawdrama/huobao_drama.backup-$(date +%Y%m%d).db`
2. 在 `deploy/.env` 配置 `REDEMPTION_CODE_PEPPER`
3. 上传课程视频与资料到上述目录
4. 标准部署（拉 main + rebuild）
5. 后台创建一个 1 张码的 internal 批次，用测试账号完整走一遍兑换→学习→撤销

## 安全底线（复述）

- 完整兑换码只在批次创建时导出一次；数据库/日志/后续接口只有摘要与末四位
- 同一码并发兑换只成功一次；退款撤销后原码不可复用
- 课程媒体走两小时签名链接，不走公开 /static，不把登录 token 放进媒体 URL
