import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getCourseOutline, getLesson, COURSE_CONTENT_DIR } from './learning-catalog.js'

test('the course has exactly eight uniquely identified lessons numbered 1-8', () => {
  const course = getCourseOutline('aigc-short-drama-v1')
  assert.ok(course, 'course exists')
  assert.equal(course!.lessons.length, 8)
  const ids = new Set(course!.lessons.map(l => l.id))
  assert.equal(ids.size, 8, 'lesson ids are unique')
  assert.deepEqual(course!.lessons.map(l => l.number), [1, 2, 3, 4, 5, 6, 7, 8])
  for (const lesson of course!.lessons) {
    assert.match(lesson.id, /^lesson-0[1-8]$/)
    assert.ok(lesson.title.length > 0)
    assert.ok(lesson.durationMinutes > 0)
    assert.ok(lesson.videoFile.endsWith('.mp4'))
  }
})

test('every lesson has an existing markdown file', () => {
  const course = getCourseOutline('aigc-short-drama-v1')!
  for (const lesson of course.lessons) {
    const file = path.join(COURSE_CONTENT_DIR, course.id, lesson.markdownFile)
    assert.ok(fs.existsSync(file), `${lesson.id} markdown missing: ${file}`)
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.includes('## 学完你能做到什么'), `${lesson.id} missing required section`)
    assert.ok(content.includes('## 跟着操作'), `${lesson.id} missing required section`)
    assert.ok(content.includes('## 完成标准'), `${lesson.id} missing required section`)
  }
})

test('unknown course and lesson lookups return null', () => {
  assert.equal(getCourseOutline('nope'), null)
  assert.equal(getLesson('aigc-short-drama-v1', 'lesson-99'), null)
  assert.equal(getLesson('nope', 'lesson-01'), null)
})
