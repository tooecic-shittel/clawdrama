<template>
  <div class="lv-page">
    <div v-if="loading" class="lv-empty">加载中…</div>

    <div v-else-if="data" class="lv-layout">
      <LearningLessonSidebar :lessons="data.lessons" :current-id="data.lesson.id" />

      <div class="lv-main">
        <div class="lv-head">
          <h1 class="lv-title">第 {{ data.lesson.number }} 节 · {{ data.lesson.title }}</h1>
          <p class="lv-outcome">🎯 {{ data.lesson.outcome }}</p>
        </div>

        <!-- 视频 -->
        <div class="lv-video-wrap">
          <video
            ref="videoEl"
            class="lv-video"
            controls
            playsinline
            preload="metadata"
            :src="data.video_url"
            @loadedmetadata="onVideoReady"
            @timeupdate="onTimeUpdate"
            @ended="onVideoEnded"
            @error="onVideoError"
          />
        </div>

        <!-- 图文 -->
        <LearningLessonArticle :blocks="data.blocks" />

        <!-- 资料 -->
        <LearningLessonResources :downloads="data.downloads" :example-project-id="data.lesson.example_project_id" />

        <!-- 导航 -->
        <div class="lv-nav">
          <NuxtLink v-if="data.prev" :to="`/learning/aigc-short-drama-v1/lessons/${data.prev.id}`" class="lv-nav-btn">← {{ data.prev.title }}</NuxtLink>
          <span v-else></span>
          <button class="lv-complete-btn" :class="{ 'is-done': isCompleted }" @click="markCompleted">
            {{ isCompleted ? '✓ 已完成本节' : '完成本节' }}
          </button>
          <NuxtLink v-if="data.next" :to="`/learning/aigc-short-drama-v1/lessons/${data.next.id}`" class="lv-nav-btn">{{ data.next.title }} →</NuxtLink>
          <span v-else></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { learningAPI } from '~/composables/useApi'

const COURSE_ID = 'aigc-short-drama-v1'
const route = useRoute()

const data = ref(null)
const loading = ref(true)
const videoEl = ref(null)
const isCompleted = ref(false)

let lastSavedAt = 0
let pendingSeek = 0

const lessonId = computed(() => String(route.params.lessonId || ''))

async function load() {
  loading.value = true
  try {
    data.value = await learningAPI.lesson(COURSE_ID, lessonId.value)
    isCompleted.value = data.value.progress?.status === 'completed'
    pendingSeek = Number(data.value.progress?.last_position_sec) || 0
  } catch (e) {
    if (/开通课程/.test(e.message || '')) {
      toast.error('请先使用学习卡兑换码开通课程')
      navigateTo('/learning')
      return
    }
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

function onVideoReady() {
  const video = videoEl.value
  if (!video || !pendingSeek) return
  // 续播：保存位置 ≥5 秒且距结尾 >10 秒才跳
  if (pendingSeek >= 5 && video.duration && pendingSeek < video.duration - 10) {
    video.currentTime = pendingSeek
  }
  pendingSeek = 0
}

function saveProgress(status, positionSec) {
  learningAPI.saveProgress(COURSE_ID, lessonId.value, {
    status,
    last_position_sec: Math.floor(positionSec || 0),
  }).catch(() => {})
}

function onTimeUpdate() {
  const video = videoEl.value
  if (!video || video.paused) return
  const now = Date.now()
  if (now - lastSavedAt < 15_000) return // 最多每 15 秒存一次
  lastSavedAt = now
  saveProgress(isCompleted.value ? 'completed' : 'in_progress', video.currentTime)
}

function onVideoEnded() {
  markCompleted()
}

async function onVideoError() {
  // 签名链接两小时过期：刷新课节载荷换新链接后续播
  const video = videoEl.value
  if (!video || !data.value) return
  const position = video.currentTime || 0
  try {
    const fresh = await learningAPI.lesson(COURSE_ID, lessonId.value)
    data.value.video_url = fresh.video_url
    data.value.downloads = fresh.downloads
    pendingSeek = position
    toast.info('播放链接已刷新')
  } catch {}
}

function markCompleted() {
  if (isCompleted.value) return
  isCompleted.value = true
  const video = videoEl.value
  saveProgress('completed', video?.currentTime || 0)
  // 本地同步侧边栏状态，无需刷新页面
  const item = (data.value?.lessons || []).find(l => l.id === lessonId.value)
  if (item) item.progress = { ...(item.progress || {}), status: 'completed' }
  toast.success('本节完成！')
}

function saveOnExit() {
  const video = videoEl.value
  if (!video || !data.value) return
  saveProgress(isCompleted.value ? 'completed' : 'in_progress', video.currentTime)
}

watch(lessonId, async () => {
  saveOnExit()
  await load()
})

onMounted(() => {
  load()
  window.addEventListener('beforeunload', saveOnExit)
})

onBeforeUnmount(() => {
  saveOnExit()
  window.removeEventListener('beforeunload', saveOnExit)
})
</script>

<style scoped>
.lv-page { padding: 24px 40px 60px; overflow-y: auto; height: 100%; }
.lv-empty { padding: 48px 0; text-align: center; color: var(--text-3, #8fa0b8); font-size: 13px; }
.lv-layout { display: flex; gap: 22px; max-width: 1120px; margin: 0 auto; align-items: flex-start; }
.lv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }

.lv-title { font-size: 20px; font-weight: 800; color: var(--text-0, #182132); margin: 0 0 4px; }
.lv-outcome { font-size: 13px; color: var(--text-2, #60718a); margin: 0; }

.lv-video-wrap { border-radius: 14px; overflow: hidden; background: #0d1117; }
.lv-video { display: block; width: 100%; aspect-ratio: 16/9; }

.lv-nav { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; margin-top: 6px; }
.lv-nav-btn {
  font-size: 13px; color: var(--text-1, #2c3850); text-decoration: none;
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff);
  border-radius: 10px; padding: 10px 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lv-nav-btn:hover { border-color: var(--accent, #8FEF26); }
.lv-nav-btn:last-child { text-align: right; }
.lv-complete-btn {
  border: none; border-radius: 10px; padding: 10px 26px; cursor: pointer;
  background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008);
  font-size: 14px; font-weight: 700;
}
.lv-complete-btn.is-done { background: var(--bg-2, #eef3f9); color: var(--accent-dark, #5da817); cursor: default; }

@media (max-width: 900px) {
  .lv-page { padding: 16px 12px 48px; }
  .lv-layout { flex-direction: column; }
  .lv-nav { grid-template-columns: 1fr; }
  .lv-nav-btn:last-child { text-align: left; }
}
</style>
