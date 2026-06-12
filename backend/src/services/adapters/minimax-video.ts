/**
 * MiniMax 海螺(Hailuo)视频生成 Adapter —— 对接 MiniMax 原生接口
 *   提交：POST {base}/v1/video_generation  {model, prompt, first_frame_image?, duration} → {task_id}
 *   轮询：GET  {base}/v1/query/video_generation?task_id=X → {status: Queueing/Processing/Success/Fail, file_id}
 *   取址：GET  {base}/v1/files/retrieve?file_id=Y → {file:{download_url}}（在 video-generation.ts 轮询里完成）
 * 海螺可接受写实 AI 人像（不像 Seedance 拒真人图），时长 6/10 秒。
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    // 海螺只支持 6 / 10 秒：≤6 取 6，否则取 10
    const d = Number(record.duration) || 6
    const body: any = {
      model: record.model || config.model || 'MiniMax-Hailuo-02',
      prompt: record.prompt || '',
      duration: d > 6 ? 10 : 6,
    }
    // 画质：仅在选 1080P 时显式传（720P 用海螺默认 768P，已验证可用，避免传错参数全军覆没）
    if (String(record.resolution || '').toLowerCase().includes('1080')) body.resolution = '1080P'
    // 图生视频：单图 / 首尾帧的首帧（海螺以首帧为参考）
    const firstImg = record.imageUrl || record.firstFrameUrl
    if (firstImg) body.first_frame_image = firstImg

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const taskId = result.task_id || result.id
    if (taskId) return { isAsync: true, taskId }
    throw new Error(result?.base_resp?.status_msg || 'MiniMax: 未返回 task_id')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/query/video_generation') + `?task_id=${encodeURIComponent(taskId)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status || result.data?.status
    if (status === 'Success') {
      // 完成只给 file_id；下载地址由 video-generation.ts 轮询用 /files/retrieve 换取
      return { status: 'completed' }
    }
    if (status === 'Fail') {
      return { status: 'failed', error: result?.base_resp?.status_msg || 'MiniMax 视频生成失败' }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result?.file?.download_url || result?.download_url || null
  }
}
