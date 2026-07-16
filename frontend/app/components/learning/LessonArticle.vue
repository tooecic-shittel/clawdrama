<template>
  <article class="la-article">
    <template v-for="(block, i) in blocks" :key="i">
      <h2 v-if="block.type === 'heading' && block.depth <= 2" class="la-h2">{{ block.text }}</h2>
      <h3 v-else-if="block.type === 'heading'" class="la-h3">{{ block.text }}</h3>
      <p v-else-if="block.type === 'paragraph'" class="la-p">{{ block.text }}</p>
      <ol v-else-if="block.type === 'list' && block.ordered" class="la-list">
        <li v-for="(item, j) in block.items" :key="j">{{ item }}</li>
      </ol>
      <ul v-else-if="block.type === 'list'" class="la-list">
        <li v-for="(item, j) in block.items" :key="j">{{ item }}</li>
      </ul>
      <blockquote v-else-if="block.type === 'quote'" class="la-quote">{{ block.text }}</blockquote>
      <pre v-else-if="block.type === 'code'" class="la-code"><code>{{ block.text }}</code></pre>
    </template>
  </article>
</template>

<script setup>
defineProps({ blocks: { type: Array, default: () => [] } })
</script>

<style scoped>
.la-article { display: flex; flex-direction: column; gap: 10px; }
.la-h2 { font-size: 18px; font-weight: 700; color: var(--text-0, #182132); margin: 14px 0 2px; }
.la-h3 { font-size: 15px; font-weight: 700; color: var(--text-0, #182132); margin: 8px 0 0; }
.la-p { font-size: 14px; line-height: 1.75; color: var(--text-1, #2c3850); margin: 0; }
.la-list { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
.la-list li { font-size: 14px; line-height: 1.7; color: var(--text-1, #2c3850); }
.la-quote {
  margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent, #8FEF26);
  background: var(--accent-bg, rgba(143,239,38,0.14)); border-radius: 0 10px 10px 0;
  font-size: 13px; color: var(--text-1, #2c3850);
}
.la-code {
  margin: 0; padding: 12px 14px; border-radius: 10px; overflow-x: auto;
  background: #1c2330; color: #d7e0ec; font-size: 12.5px; line-height: 1.6;
}
</style>
