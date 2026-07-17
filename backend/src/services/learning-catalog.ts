/**
 * 课程目录：类型化管理课程与课节元数据。
 * 图文正文放版本库 course-content/；大视频与资料放 LEARNING_DATA_DIR（不进 Git）。
 * 第一版只有一门课：aigc-short-drama-v1（AI 短剧全流程制作学习卡），固定 8 节。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 版本库内的课程图文根目录 */
export const COURSE_CONTENT_DIR = path.resolve(__dirname, '../../../course-content')

export interface LessonMeta {
  id: string
  number: number
  title: string
  summary: string
  durationMinutes: number
  outcome: string
  markdownFile: string
  videoFile: string
  downloads: string[]
  exampleProjectId?: number
}

export interface CourseOutline {
  id: string
  title: string
  subtitle: string
  outcome: string
  deliverables: string[]
  lessons: LessonMeta[]
}

const AIGC_SHORT_DRAMA: CourseOutline = {
  id: 'aigc-short-drama-v1',
  title: 'AI 短剧全流程制作学习卡',
  subtitle: '从剧本到成片，8 节课跑通 AI 短剧完整生产线',
  outcome: '独立完成一部 1-2 分钟、有完整剧情的 AI 短剧成片，并掌握可复用的量产工作流',
  deliverables: [
    '8 节录播课程',
    '每节图文教程与操作清单',
    '示例剧本与示例项目',
    '随课平台积分',
    '微信群答疑',
    '每周一次直播演示',
    '全套模板与检查清单（课内直接查看）',
  ],
  lessons: [
    {
      id: 'lesson-01',
      number: 1,
      title: 'AI 短剧制作全流程认知',
      summary: '认识从剧本到成片的完整路径，完成账号、积分和示例项目准备',
      durationMinutes: 25,
      outcome: '看懂整条生产线，账号与素材准备就绪',
      markdownFile: 'lessons/01-workflow.md',
      videoFile: 'lesson-01.mp4',
      downloads: [],
    },
    {
      id: 'lesson-02',
      number: 2,
      title: '准备一个可制作的短剧剧本',
      summary: '将创意整理成 1-2 分钟、2-3 个角色、3-5 个镜头的可制作剧本',
      durationMinutes: 30,
      outcome: '写出一份符合制作规格的短剧剧本',
      markdownFile: 'lessons/02-script.md',
      videoFile: 'lesson-02.mp4',
      downloads: [],
    },
    {
      id: 'lesson-03',
      number: 3,
      title: '剧本导入与 AI 改写',
      summary: '导入剧本，理解原始内容与 AI 改写，得到适合生产的规范剧本',
      durationMinutes: 25,
      outcome: '得到一份 AI 规范化、可直接拆分镜的剧本',
      markdownFile: 'lessons/03-rewrite.md',
      videoFile: 'lesson-03.mp4',
      downloads: [],
    },
    {
      id: 'lesson-04',
      number: 4,
      title: '分镜拆解与角色提取',
      summary: '完成场景、角色和镜头拆解，检查剧情、台词、动作和节奏是否完整',
      durationMinutes: 35,
      outcome: '得到节拍完整、可生产的分镜表和角色/场景清单',
      markdownFile: 'lessons/04-breakdown.md',
      videoFile: 'lesson-04.mp4',
      downloads: [],
    },
    {
      id: 'lesson-05',
      number: 5,
      title: '角色形象与场景图生成',
      summary: '建立角色一致性，生成角色、场景和必要参考图',
      durationMinutes: 35,
      outcome: '生成全剧统一的角色形象（含三视图）和场景图',
      markdownFile: 'lessons/05-character-scene.md',
      videoFile: 'lesson-05.mp4',
      downloads: [],
    },
    {
      id: 'lesson-06',
      number: 6,
      title: '镜头图片生成',
      summary: '生成首帧、尾帧和镜头图，控制构图、景别、动作与连续性',
      durationMinutes: 30,
      outcome: '为每个镜头生成合格的首帧/尾帧',
      markdownFile: 'lessons/06-shot-images.md',
      videoFile: 'lesson-06.mp4',
      downloads: [],
    },
    {
      id: 'lesson-07',
      number: 7,
      title: '视频生成与模型选择',
      summary: '根据镜头选择 Seedance、HappyHorse 或海螺，设置首尾帧、时长、画质和提示词',
      durationMinutes: 40,
      outcome: '按镜头特点选对引擎并批量产出可用视频片段',
      markdownFile: 'lessons/07-video.md',
      videoFile: 'lesson-07.mp4',
      downloads: [],
    },
    {
      id: 'lesson-08',
      number: 8,
      title: '配音、字幕与成片合成',
      summary: '生成台词与旁白，加入音效、字幕、背景音乐并导出完整样片',
      durationMinutes: 35,
      outcome: '导出一部带配音字幕的完整短剧样片',
      markdownFile: 'lessons/08-audio-compose.md',
      videoFile: 'lesson-08.mp4',
      downloads: [],
    },
  ],
}

const COURSES: Record<string, CourseOutline> = {
  [AIGC_SHORT_DRAMA.id]: AIGC_SHORT_DRAMA,
}

export function getCourseOutline(courseId: string): CourseOutline | null {
  return COURSES[courseId] || null
}

export function getLesson(courseId: string, lessonId: string): LessonMeta | null {
  const course = COURSES[courseId]
  if (!course) return null
  return course.lessons.find(l => l.id === lessonId) || null
}
