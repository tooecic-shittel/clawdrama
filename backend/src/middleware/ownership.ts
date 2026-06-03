/**
 * 多租户归属判定。所有剧集相关资源最终都挂在某个 drama 上，drama.user_id 是属主。
 * 规则：管理员放行一切；普通用户只能访问自己的；旧数据（owner 为 null）仅管理员可见。
 *
 * 用法（在路由处理器里）：
 *   if (!canAccess(c, episodeOwnerId(id))) return notFound(c)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

export function dramaOwnerId(dramaId: number | null | undefined): number | null {
  if (!dramaId) return null
  const [d] = db.select({ userId: schema.dramas.userId }).from(schema.dramas)
    .where(eq(schema.dramas.id, dramaId)).all()
  return d ? (d.userId ?? null) : null
}

export function episodeOwnerId(episodeId: number | null | undefined): number | null {
  if (!episodeId) return null
  const [e] = db.select({ dramaId: schema.episodes.dramaId }).from(schema.episodes)
    .where(eq(schema.episodes.id, episodeId)).all()
  return e ? dramaOwnerId(e.dramaId) : null
}

export function storyboardOwnerId(storyboardId: number | null | undefined): number | null {
  if (!storyboardId) return null
  const [s] = db.select({ episodeId: schema.storyboards.episodeId }).from(schema.storyboards)
    .where(eq(schema.storyboards.id, storyboardId)).all()
  return s ? episodeOwnerId(s.episodeId) : null
}

export function characterOwnerId(characterId: number | null | undefined): number | null {
  if (!characterId) return null
  const [r] = db.select({ dramaId: schema.characters.dramaId }).from(schema.characters)
    .where(eq(schema.characters.id, characterId)).all()
  return r ? dramaOwnerId(r.dramaId) : null
}

export function sceneOwnerId(sceneId: number | null | undefined): number | null {
  if (!sceneId) return null
  const [r] = db.select({ dramaId: schema.scenes.dramaId }).from(schema.scenes)
    .where(eq(schema.scenes.id, sceneId)).all()
  return r ? dramaOwnerId(r.dramaId) : null
}

/** 普通用户必须是属主；管理员放行；owner 为 null（旧数据）仅管理员。 */
export function canAccess(c: any, ownerId: number | null): boolean {
  const user = c.get('user')
  if (user?.role === 'admin') return true
  return ownerId != null && ownerId === user?.id
}
