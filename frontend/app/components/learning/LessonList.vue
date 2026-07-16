<template>
  <div class="ll-list">
    <component
      :is="access ? NuxtLink : 'div'"
      v-for="lesson in lessons"
      :key="lesson.id"
      :to="access ? `/learning/${courseId}/lessons/${lesson.id}` : undefined"
      class="ll-row"
      :class="{ 'is-locked': !access }"
    >
      <span class="ll-status" :class="statusClass(lesson)">
        <template v-if="lesson.progress?.status === 'completed'">✓</template>
        <template v-else>{{ lesson.number }}</template>
      </span>
      <span class="ll-main">
        <span class="ll-title">{{ lesson.title }}</span>
        <span class="ll-sub">{{ lesson.summary }}</span>
      </span>
      <span class="ll-meta">
        <span class="ll-duration">{{ lesson.duration_minutes }} 分钟</span>
        <span v-if="!access" class="ll-lock">🔒</span>
        <span v-else-if="lesson.progress?.status === 'completed'" class="ll-done">已完成</span>
        <span v-else-if="lesson.progress" class="ll-doing">学习中</span>
      </span>
    </component>
  </div>
</template>

<script setup>
import { NuxtLink } from '#components'

defineProps({
  courseId: { type: String, required: true },
  lessons: { type: Array, default: () => [] },
  access: { type: Boolean, default: false },
})

function statusClass(lesson) {
  if (lesson.progress?.status === 'completed') return 'is-done'
  if (lesson.progress) return 'is-doing'
  return ''
}
</script>

<style scoped>
.ll-list { display: flex; flex-direction: column; border: 1px solid var(--border, #dbe4f0); border-radius: 14px; background: var(--bg-0, #fff); overflow: hidden; }
.ll-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; text-decoration: none; transition: background 0.15s; }
.ll-row + .ll-row { border-top: 1px solid var(--border, #dbe4f0); }
.ll-row:not(.is-locked):hover { background: var(--accent-bg, rgba(143,239,38,0.14)); }
.ll-row.is-locked { cursor: default; }

.ll-status {
  width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; font-size: 13px; font-weight: 800;
  background: var(--bg-2, #eef3f9); color: var(--text-2, #60718a);
}
.ll-status.is-done { background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008); }
.ll-status.is-doing { background: var(--accent-bg, rgba(143,239,38,0.14)); color: var(--accent-dark, #5da817); }

.ll-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ll-title { font-size: 14px; font-weight: 600; color: var(--text-0, #182132); }
.ll-sub { font-size: 12px; color: var(--text-3, #8fa0b8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ll-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ll-duration { font-size: 11px; color: var(--text-3, #8fa0b8); }
.ll-done { font-size: 11px; font-weight: 600; color: var(--accent-dark, #5da817); }
.ll-doing { font-size: 11px; font-weight: 600; color: var(--text-2, #60718a); }
.ll-lock { font-size: 12px; }

@media (max-width: 600px) {
  .ll-sub { white-space: normal; }
}
</style>
