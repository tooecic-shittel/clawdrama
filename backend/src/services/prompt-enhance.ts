/**
 * Prompt enhancement helpers — inject drama visual style + storyboard sound effects
 * into the prompt before sending to image/video generation models.
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'

const STYLE_PROMPTS: Record<string, string> = {
  realistic: 'photorealistic, cinematic photography, natural lighting, fine skin detail',
  anime: 'anime style, vibrant colors, japanese animation aesthetic, expressive characters, sharp lineart',
  ghibli: 'Studio Ghibli style, soft watercolor backgrounds, dreamy atmosphere, warm tones',
  cinematic: 'cinematic film look, dramatic lighting, shallow depth of field, color graded',
  comic: 'comic book illustration, bold outlines, dynamic composition, vivid pop colors',
  watercolor: 'watercolor painting style, soft brush strokes, gentle gradients, artistic feel',
}

/** Look up the drama and return its visual style descriptor (or empty string). */
export function getStyleSuffix(dramaId: number | null | undefined): string {
  if (!dramaId) return ''
  try {
    const [drama] = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).all()
    if (!drama?.style) return ''
    return STYLE_PROMPTS[drama.style] || ''
  } catch {
    return ''
  }
}

/**
 * Resolve drama id given various locators (storyboardId/episodeId/sceneId/characterId).
 * Image gen records often have storyboardId but no dramaId.
 */
export function resolveDramaId(opts: {
  dramaId?: number | null
  storyboardId?: number | null
  episodeId?: number | null
  sceneId?: number | null
  characterId?: number | null
}): number | null {
  if (opts.dramaId) return opts.dramaId
  try {
    if (opts.storyboardId) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, opts.storyboardId)).all()
      if (sb?.episodeId) {
        const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
        return ep?.dramaId ?? null
      }
    }
    if (opts.episodeId) {
      const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, opts.episodeId)).all()
      return ep?.dramaId ?? null
    }
    if (opts.sceneId) {
      const [scene] = db.select().from(schema.scenes).where(eq(schema.scenes.id, opts.sceneId)).all()
      return scene?.dramaId ?? null
    }
    if (opts.characterId) {
      const [ch] = db.select().from(schema.characters).where(eq(schema.characters.id, opts.characterId)).all()
      return ch?.dramaId ?? null
    }
  } catch {}
  return null
}

/**
 * Enhance an image prompt with the drama's visual style.
 */
export function enhanceImagePrompt(prompt: string, dramaId: number | null | undefined): string {
  const styleSuffix = getStyleSuffix(dramaId)
  if (!styleSuffix) return prompt
  return `${prompt}. Style: ${styleSuffix}.`
}

/**
 * Add a hint to a frame prompt indicating it should visually continue from the
 * previous shot (for match-cut continuity). Only used when match-cut refs exist.
 */
export function enhanceFramePromptForContinuity(prompt: string, frameType: string): string {
  if (frameType === 'first_frame') {
    return `${prompt}\nThe first reference image shows the previous shot's ending — continue from a similar composition, lighting and color palette to ensure smooth visual continuity (match cut).`
  }
  if (frameType === 'last_frame') {
    return `${prompt}\nThe first reference image shows this shot's first frame — the result should be the natural ending of the same scene (same location, same lighting), only with the action progressed.`
  }
  return prompt
}

/**
 * Enhance a video prompt with style + ambient sound effect description.
 * Veo 3 generates audio from text descriptions, so describing the soundscape
 * in the prompt gets baked into the output.
 */
export function enhanceVideoPrompt(
  prompt: string,
  opts: { dramaId?: number | null; storyboardId?: number | null },
): string {
  const dramaId = resolveDramaId(opts)
  const styleSuffix = getStyleSuffix(dramaId)

  let soundEffect = ''
  try {
    if (opts.storyboardId) {
      const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, opts.storyboardId)).all()
      if (sb?.soundEffect) soundEffect = sb.soundEffect.trim()
    }
  } catch {}

  const parts = [prompt]
  if (styleSuffix) parts.push(`Visual style: ${styleSuffix}`)
  if (soundEffect) parts.push(`Audio: ${soundEffect}`)
  return parts.join('. ')
}
