<template>
  <div class="lp-page">
    <div v-if="loading" class="lp-empty">加载中…</div>

    <template v-else-if="data">
      <!-- 未开通：课程介绍 + 兑换 -->
      <template v-if="!data.access">
        <section class="lp-hero">
          <div class="lp-hero-badge">学习中心</div>
          <h1 class="lp-hero-title">{{ data.course.title }}</h1>
          <p class="lp-hero-sub">{{ data.course.subtitle }}</p>
          <p class="lp-hero-outcome">🎯 {{ data.course.outcome }}</p>
        </section>

        <LearningRedeemCard :prefill="prefillCode" @redeemed="onRedeemed" />

        <section class="lp-section">
          <h2 class="lp-section-title">你将获得</h2>
          <div class="lp-deliverables">
            <span v-for="d in data.course.deliverables" :key="d" class="lp-deliverable">✓ {{ d }}</span>
          </div>
        </section>

        <section class="lp-section">
          <h2 class="lp-section-title">8 节课程目录</h2>
          <LearningLessonList :course-id="data.course.id" :lessons="data.course.lessons" :access="false" />
        </section>
      </template>

      <!-- 已开通：进度 + 继续学习 -->
      <template v-else>
        <section class="lp-hero is-enrolled">
          <div class="lp-hero-badge">已开通</div>
          <h1 class="lp-hero-title">{{ data.course.title }}</h1>
          <p class="lp-hero-sub">{{ data.course.subtitle }}</p>
        </section>

        <LearningCourseProgress
          :course-id="data.course.id"
          :completed="data.completed_lessons"
          :total="data.total_lessons"
          :continue-lesson-id="continueLessonId"
        />

        <section class="lp-section">
          <h2 class="lp-section-title">课程目录</h2>
          <LearningLessonList :course-id="data.course.id" :lessons="data.course.lessons" :access="true" />
        </section>

        <section v-if="data.wechat_url || data.live_url" class="lp-section lp-links">
          <a v-if="data.wechat_url" :href="data.wechat_url" target="_blank" rel="noopener" class="lp-link-card">
            <span class="lp-link-icon">💬</span>
            <span><b>微信群答疑</b><i>入群提问，讲师和同学一起答</i></span>
          </a>
          <a v-if="data.live_url" :href="data.live_url" target="_blank" rel="noopener" class="lp-link-card">
            <span class="lp-link-icon">📺</span>
            <span><b>每周直播演示</b><i>每周一次实操直播与答疑</i></span>
          </a>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { learningAPI } from '~/composables/useApi'

const route = useRoute()
const data = ref(null)
const loading = ref(true)
const prefillCode = computed(() => (typeof route.query.code === 'string' ? route.query.code : ''))

const continueLessonId = computed(() => {
  const lessons = data.value?.course?.lessons || []
  const next = lessons.find(l => l.progress?.status !== 'completed')
  return (next || lessons[0])?.id || ''
})

async function load() {
  loading.value = true
  try {
    data.value = await learningAPI.courses()
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function onRedeemed() {
  await load()
}

onMounted(load)
</script>

<style scoped>
.lp-page { padding: 28px 48px 60px; overflow-y: auto; height: 100%; max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.lp-empty { padding: 48px 0; text-align: center; color: var(--text-3, #8fa0b8); font-size: 13px; }

.lp-hero {
  border-radius: 18px; padding: 30px 34px;
  background:
    radial-gradient(560px 240px at 88% -20%, var(--accent-bg, rgba(143,239,38,0.14)), transparent 70%),
    linear-gradient(135deg, var(--bg-1, #f8fbff), var(--bg-2, #eef3f9));
  border: 1px solid var(--border, #dbe4f0);
}
.lp-hero-badge {
  display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 12px; border-radius: 999px;
  color: var(--accent-text, #2d5008); background: var(--accent-bg, rgba(143,239,38,0.14));
  border: 1px solid var(--accent, #8FEF26); margin-bottom: 10px;
}
.lp-hero-title { font-size: 26px; font-weight: 800; color: var(--text-0, #182132); margin: 0 0 6px; }
.lp-hero-sub { font-size: 14px; color: var(--text-2, #60718a); margin: 0; }
.lp-hero-outcome { font-size: 13px; color: var(--text-1, #2c3850); margin: 12px 0 0; }

.lp-section-title { font-size: 16px; font-weight: 700; color: var(--text-0, #182132); margin: 0 0 10px; }
.lp-deliverables { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-deliverable {
  font-size: 13px; color: var(--text-1, #2c3850);
  background: var(--bg-0, #fff); border: 1px solid var(--border, #dbe4f0);
  border-radius: 999px; padding: 6px 14px;
}

.lp-links { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-link-card {
  display: flex; align-items: center; gap: 12px; text-decoration: none;
  border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff);
  border-radius: 14px; padding: 14px 16px; transition: border-color 0.15s;
}
.lp-link-card:hover { border-color: var(--accent, #8FEF26); }
.lp-link-icon { font-size: 24px; }
.lp-link-card b { display: block; font-size: 14px; color: var(--text-0, #182132); }
.lp-link-card i { display: block; font-style: normal; font-size: 12px; color: var(--text-3, #8fa0b8); }

@media (max-width: 720px) {
  .lp-page { padding: 20px 14px 48px; }
  .lp-hero { padding: 22px 18px; }
  .lp-links { grid-template-columns: 1fr; }
}
</style>
