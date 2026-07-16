<template>
  <div class="cp-card">
    <div class="cp-row">
      <div>
        <div class="cp-label">总体进度</div>
        <div class="cp-num">{{ completed }}<span class="cp-total">/{{ total }} 节完成</span></div>
      </div>
      <NuxtLink v-if="continueLessonId" :to="`/learning/${courseId}/lessons/${continueLessonId}`" class="cp-btn">
        {{ completed === 0 ? '开始学习' : (completed >= total ? '重新回顾' : '继续学习') }}
      </NuxtLink>
    </div>
    <div class="cp-track"><b :style="{ width: `${total ? Math.round((completed / total) * 100) : 0}%` }"></b></div>
  </div>
</template>

<script setup>
defineProps({
  courseId: { type: String, required: true },
  completed: { type: Number, default: 0 },
  total: { type: Number, default: 8 },
  continueLessonId: { type: String, default: '' },
})
</script>

<style scoped>
.cp-card { border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff); border-radius: 14px; padding: 16px 18px; }
.cp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.cp-label { font-size: 12px; color: var(--text-3, #8fa0b8); }
.cp-num { font-size: 24px; font-weight: 800; color: var(--text-0, #182132); }
.cp-total { font-size: 13px; font-weight: 500; color: var(--text-2, #60718a); margin-left: 4px; }
.cp-btn {
  padding: 10px 22px; border-radius: 10px; text-decoration: none;
  background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008);
  font-size: 14px; font-weight: 700; white-space: nowrap;
}
.cp-track { height: 8px; border-radius: 999px; background: var(--bg-2, #eef3f9); overflow: hidden; }
.cp-track b { display: block; height: 100%; border-radius: 999px; background: var(--accent, #8FEF26); transition: width 0.4s ease; }
</style>
