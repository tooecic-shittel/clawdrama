/**
 * 全局串行化 ffmpeg 执行。
 *
 * 容器（如 Railway）资源有限，同时跑多个 ffmpeg（合成 + 拼接 + 用户多点）会把
 * 线程/内存打满 → pthread_create failed / OOM SIGKILL / 解码器 Resource temporarily
 * unavailable。这里用一条 Promise 链把所有 ffmpeg 调用排队，保证同一时刻只有一个在跑。
 */
let chain: Promise<unknown> = Promise.resolve()

export function runFfmpegExclusive<T>(fn: () => Promise<T>): Promise<T> {
  // 不管上一个成功失败，都接着排下一个（失败不阻断队列）
  const run = chain.then(fn, fn) as Promise<T>
  chain = run.then(() => undefined, () => undefined)
  return run
}
