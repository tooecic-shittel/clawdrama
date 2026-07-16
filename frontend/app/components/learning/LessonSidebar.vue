<template>
  <aside class="ls-side">
    <NuxtLink to="/learning/aigc-short-drama-v1" class="ls-back">← 课程总览</NuxtLink>
    <div class="ls-list">
      <NuxtLink
        v-for="item in lessons"
        :key="item.id"
        :to="`/learning/aigc-short-drama-v1/lessons/${item.id}`"
        class="ls-row"
        :class="{ 'is-current': item.id === currentId }"
      >
        <span class="ls-num" :class="{ 'is-done': item.progress?.status === 'completed' }">
          <template v-if="item.progress?.status === 'completed'">✓</template>
          <template v-else>{{ item.number }}</template>
        </span>
        <span class="ls-title">{{ item.title }}</span>
      </NuxtLink>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  lessons: { type: Array, default: () => [] },
  currentId: { type: String, default: '' },
})
</script>

<style scoped>
.ls-side { width: 240px; flex-shrink: 0; }
.ls-back { display: inline-block; font-size: 12px; color: var(--text-2, #60718a); text-decoration: none; margin-bottom: 10px; }
.ls-back:hover { color: var(--accent-dark, #5da817); }
.ls-list { border: 1px solid var(--border, #dbe4f0); border-radius: 12px; background: var(--bg-0, #fff); overflow: hidden; }
.ls-row { display: flex; align-items: center; gap: 9px; padding: 10px 12px; text-decoration: none; }
.ls-row + .ls-row { border-top: 1px solid var(--border, #dbe4f0); }
.ls-row:hover { background: var(--accent-bg, rgba(143,239,38,0.14)); }
.ls-row.is-current { background: var(--accent-bg, rgba(143,239,38,0.14)); box-shadow: inset 3px 0 0 var(--accent, #8FEF26); }
.ls-num {
  width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; font-size: 11px; font-weight: 800;
  background: var(--bg-2, #eef3f9); color: var(--text-2, #60718a);
}
.ls-num.is-done { background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008); }
.ls-title { font-size: 12.5px; color: var(--text-1, #2c3850); line-height: 1.35; }

@media (max-width: 900px) {
  .ls-side { width: 100%; }
  .ls-list { display: grid; grid-template-columns: 1fr 1fr; }
  .ls-row + .ls-row { border-top: none; }
  .ls-row { border-bottom: 1px solid var(--border, #dbe4f0); }
}
</style>
