#!/usr/bin/env bash
# 给 2C2G 小机器加 4G swap，避免 ffmpeg 合成/拼接、镜像拉取时的内存峰值触发 OOM。
# 幂等：重复执行安全。需 root（sudo bash setup-swap.sh）。
set -euo pipefail

SWAPFILE=/swapfile
SIZE_MB=4096   # 4 GiB；内存更紧可调大到 6144/8192

if swapon --show 2>/dev/null | grep -q "$SWAPFILE"; then
  echo "✅ swap 已启用，跳过"
  free -h
  exit 0
fi

echo "→ 创建 ${SIZE_MB}MB swap 文件 ..."
if ! fallocate -l "${SIZE_MB}M" "$SWAPFILE" 2>/dev/null; then
  dd if=/dev/zero of="$SWAPFILE" bs=1M count="$SIZE_MB" status=progress
fi
chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE"
swapon "$SWAPFILE"

# 开机自动挂载
grep -q "^$SWAPFILE " /etc/fstab || echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab

# 优先用物理内存，少用 swap（10 = 仅在内存紧张时才用）
sysctl -w vm.swappiness=10 >/dev/null
grep -q "^vm.swappiness" /etc/sysctl.conf || echo "vm.swappiness=10" >> /etc/sysctl.conf

echo "✅ 4G swap 已启用并设为开机自启"
free -h
