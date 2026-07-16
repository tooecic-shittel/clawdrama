<template>
  <div class="co-page">
    <div v-if="loading" class="co-empty">加载中…</div>

    <template v-else-if="data">
      <div v-if="!data.access" class="co-locked">
        <p>请先使用学习卡兑换码开通课程</p>
        <NuxtLink to="/learning" class="co-btn">去兑换</NuxtLink>
      </div>

      <template v-else>
        <section class="co-head">
          <div>
            <h1 class="co-title">{{ data.course.title }}</h1>
            <p class="co-outcome">🎯 {{ data.course.outcome }}</p>
          </div>
        </section>

        <LearningCourseProgress
          :course-id="data.course.id"
          :completed="data.completed_lessons"
          :total="data.total_lessons"
          :continue-lesson-id="continueLessonId"
        />

        <section>
          <h2 class="co-section-title">课程目录</h2>
          <LearningLessonList :course-id="data.course.id" :lessons="data.course.lessons" :access="true" />
        </section>

        <section v-if="data.wechat_url || data.live_url" class="co-links">
          <a v-if="data.wechat_url" :href="data.wechat_url" target="_blank" rel="noopener" class="co-link-card">💬 微信群答疑</a>
          <a v-if="data.live_url" :href="data.live_url" target="_blank" rel="noopener" class="co-link-card">📺 每周直播演示</a>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { learningAPI } from '~/composables/useApi'

const data = ref(null)
const loading = ref(true)

const continueLessonId = computed(() => {
  const lessons = data.value?.course?.lessons || []
  const next = lessons.find(l => l.progress?.status !== 'completed')
  return (next || lessons[0])?.id || ''
})

onMounted(async () => {
  try {
    data.value = await learningAPI.course('aigc-short-drama-v1')
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.co-page { padding: 28px 48px 60px; overflow-y: auto; height: 100%; max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.co-empty { padding: 48px 0; text-align: center; color: var(--text-3, #8fa0b8); font-size: 13px; }
.co-locked { padding: 60px 0; text-align: center; color: var(--text-2, #60718a); font-size: 14px; }
.co-btn {
  display: inline-block; margin-top: 14px; padding: 10px 26px; border-radius: 10px; text-decoration: none;
  background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008); font-weight: 700; font-size: 14px;
}
.co-title { font-size: 24px; font-weight: 800; color: var(--text-0, #182132); margin: 0 0 6px; }
.co-outcome { font-size: 13px; color: var(--text-2, #60718a); margin: 0; }
.co-section-title { font-size: 16px; font-weight: 700; color: var(--text-0, #182132); margin: 0 0 10px; }
.co-links { display: flex; gap: 12px; flex-wrap: wrap; }
.co-link-card {
  text-decoration: none; font-size: 14px; font-weight: 600; color: var(--text-1, #2c3850);
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff);
  border-radius: 12px; padding: 12px 18px;
}
.co-link-card:hover { border-color: var(--accent, #8FEF26); }
@media (max-width: 720px) { .co-page { padding: 20px 14px 48px; } }
</style>
