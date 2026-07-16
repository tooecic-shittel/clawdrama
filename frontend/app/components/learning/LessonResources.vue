<template>
  <div v-if="downloads.length || exampleProjectId" class="lr-card">
    <div class="lr-title">本节资料</div>
    <div class="lr-list">
      <a v-for="d in downloads" :key="d.name" :href="d.url" class="lr-row" download>
        <span class="lr-icon">📄</span>
        <span class="lr-name">{{ d.name }}</span>
        <span class="lr-action">下载</span>
      </a>
      <NuxtLink v-if="exampleProjectId" :to="`/drama/${exampleProjectId}`" class="lr-row">
        <span class="lr-icon">🎬</span>
        <span class="lr-name">打开示例项目</span>
        <span class="lr-action">查看</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
defineProps({
  downloads: { type: Array, default: () => [] },
  exampleProjectId: { type: Number, default: null },
})
</script>

<style scoped>
.lr-card { border: 1px solid var(--border, #dbe4f0); background: var(--bg-0, #fff); border-radius: 12px; padding: 14px 16px; }
.lr-title { font-size: 13px; font-weight: 700; color: var(--text-0, #182132); margin-bottom: 8px; }
.lr-list { display: flex; flex-direction: column; }
.lr-row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; text-decoration: none; border-radius: 8px; }
.lr-row:hover { background: var(--accent-bg, rgba(143,239,38,0.14)); }
.lr-icon { font-size: 15px; }
.lr-name { flex: 1; font-size: 13px; color: var(--text-1, #2c3850); }
.lr-action { font-size: 12px; font-weight: 600; color: var(--accent-dark, #5da817); }
</style>
