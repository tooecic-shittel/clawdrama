/**
 * Seedance（火山方舟）并发闸 —— 进程内信号量。
 *
 * 背景：火山 ARK 对 Seedance 视频任务有「同时进行中任务数」上限（约 4）。一次性甩出
 * 很多任务时，超出的会被 429 限流，重试耗尽后只能回退到 happyhorse（带水印）。
 * 这个闸把「同时在跑的 Seedance 任务」限制在 MAX 个，超出的排队等位，而不是被限流回退。
 *
 * 为什么是进程内信号量（而非 DB 队列）：后端是单实例（better-sqlite3 本地库决定了无法横向扩展），
 * 所有 processVideoGeneration 跑在同一进程、共享这里的 active/waiters，足够且最简单。
 *
 * 扩展到「API 池」（多把 key）的接入点：把 active/waiters 改成「按 key 分组」的多组计数，
 * acquire 时返回「拿到的是哪把 key」，调用方用那把 key 提交+轮询。当前单 key，先不做。
 */
import { logTaskProgress } from '../utils/task-logger.js'

// 同时在跑的 Seedance 任务上限（火山并发配额，按账号 tier 而定；可用环境变量覆盖）。
export const SEEDANCE_MAX = Math.max(1, Number(process.env.SEEDANCE_CONCURRENCY) || 4)
// 排队等位的最长时间（毫秒）；超过仍没轮到 → acquire 返回 false，调用方回退兜底。默认 10 分钟。
export const SEEDANCE_WAIT_MS = Math.max(0, Number(process.env.SEEDANCE_QUEUE_WAIT_MS) || 10 * 60 * 1000)
export const SEEDANCE_WAIT_MIN = Math.round(SEEDANCE_WAIT_MS / 60000)

interface Waiter {
  settled: boolean
  grant: () => void
}

let active = 0
const waiters: Waiter[] = []

/** 当前占用 / 排队 / 上限 —— 供日志与前端状态展示。 */
export function seedanceStats(): { active: number; queued: number; max: number } {
  return { active, queued: waiters.length, max: SEEDANCE_MAX }
}

/**
 * 申请一个 Seedance 槽位。
 *   - 有空位：立即占用，resolve(true)。
 *   - 无空位：排队，等到有人释放把槽位「转交」过来 → resolve(true)；
 *             或等待超过 SEEDANCE_WAIT_MS 仍没轮到 → resolve(false)（调用方据此回退）。
 * 拿到 true 的调用方，任务结束后必须调用 releaseSeedanceSlot() 释放（放 finally）。
 */
export function acquireSeedanceSlot(): Promise<boolean> {
  if (active < SEEDANCE_MAX) {
    active++
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    const w: Waiter = { settled: false, grant: () => {} }
    const timer = setTimeout(() => {
      if (w.settled) return
      w.settled = true
      const i = waiters.indexOf(w)
      if (i >= 0) waiters.splice(i, 1)
      logTaskProgress('Seedance', 'queue-timeout', { waitedMin: SEEDANCE_WAIT_MIN, ...seedanceStats() })
      resolve(false)
    }, SEEDANCE_WAIT_MS)
    // 被转交槽位时：active 不变（一出一进），只解除等待。
    w.grant = () => {
      if (w.settled) return
      w.settled = true
      clearTimeout(timer)
      resolve(true)
    }
    waiters.push(w)
  })
}

/** 释放一个槽位：有等待者就把槽位转交给它（active 不变）；否则空出来（active--）。 */
export function releaseSeedanceSlot(): void {
  while (waiters.length) {
    const w = waiters.shift()!
    if (!w.settled) {
      w.grant() // 槽位转交，active 保持不变
      return
    }
  }
  if (active > 0) active--
}
