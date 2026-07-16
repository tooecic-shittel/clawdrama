/**
 * 课程图文内容：读取版本库里的 Markdown，用 marked.lexer 切成结构化块。
 * 只返回结构化数据（heading/paragraph/list/quote/code），前端用组件渲染，
 * 不返回 HTML、不需要 v-html。
 */
import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'
import { COURSE_CONTENT_DIR, getCourseOutline, getLesson } from './learning-catalog.js'

export type LessonBlock =
  | { type: 'heading'; depth: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; text: string }

function inlineText(token: any): string {
  // 保留纯文本：吃掉 **强调**、`code`、[链接](url) 等内联标记
  if (!token) return ''
  if (typeof token === 'string') return token
  if (Array.isArray(token.tokens) && token.tokens.length) {
    return token.tokens.map(inlineText).join('')
  }
  return String(token.text ?? token.raw ?? '')
}

export function getLessonBlocks(courseId: string, lessonId: string): LessonBlock[] | null {
  const course = getCourseOutline(courseId)
  const lesson = getLesson(courseId, lessonId)
  if (!course || !lesson) return null

  const file = path.join(COURSE_CONTENT_DIR, course.id, lesson.markdownFile)
  const resolved = path.resolve(file)
  if (!resolved.startsWith(path.resolve(COURSE_CONTENT_DIR))) return null
  if (!fs.existsSync(resolved)) return null

  const tokens = marked.lexer(fs.readFileSync(resolved, 'utf8'))
  const blocks: LessonBlock[] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        blocks.push({ type: 'heading', depth: token.depth, text: inlineText(token) })
        break
      case 'paragraph':
        blocks.push({ type: 'paragraph', text: inlineText(token) })
        break
      case 'list':
        blocks.push({
          type: 'list',
          ordered: !!token.ordered,
          items: (token.items || []).map((item: any) => inlineText(item)),
        })
        break
      case 'blockquote':
        blocks.push({ type: 'quote', text: inlineText(token) })
        break
      case 'code':
        blocks.push({ type: 'code', lang: token.lang || '', text: token.text || '' })
        break
      default:
        break // space/hr 等忽略
    }
  }
  return blocks
}
