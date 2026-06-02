/**
 * Visual style labels — keep in sync with backend prompt-enhance.ts STYLE_PROMPTS keys.
 */
const STYLE_LABELS: Record<string, string> = {
  realistic: '写实',
  anime: '日漫',
  ghibli: '吉卜力',
  cinematic: '电影感',
  comic: '美漫',
  watercolor: '水彩画',
}

export function styleLabel(value: string | null | undefined): string {
  if (!value) return ''
  return STYLE_LABELS[String(value).toLowerCase()] || String(value)
}

export const STYLE_OPTIONS = Object.entries(STYLE_LABELS).map(([value, label]) => ({ value, label }))
