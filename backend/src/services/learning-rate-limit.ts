/**
 * 兑换尝试限流：按登录用户 id 记失败次数，10 分钟滚动窗口内最多 10 次失败。
 * 成功兑换后清零。进程内存实现（单实例部署够用；多实例时换共享存储）。
 */
const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 10

const failures = new Map<number, number[]>()

function prune(userId: number): number[] {
  const cutoff = Date.now() - WINDOW_MS
  const list = (failures.get(userId) || []).filter(ts => ts > cutoff)
  failures.set(userId, list)
  return list
}

export function isRedemptionLimited(userId: number): boolean {
  return prune(userId).length >= MAX_FAILURES
}

export function recordRedemptionFailure(userId: number) {
  const list = prune(userId)
  list.push(Date.now())
  failures.set(userId, list)
}

export function clearRedemptionFailures(userId: number) {
  failures.delete(userId)
}
