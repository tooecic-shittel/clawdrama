<template>
  <div v-if="open" class="overlay" @keydown.esc="close">
    <form class="modal card" @submit.prevent="onSubmit">
      <div class="head">
        <div>
          <div class="kicker">CUSTOM GENERATE</div>
          <h2 class="title">{{ title }}</h2>
          <div class="sub">{{ subtitle }}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" @click="close" title="关闭">×</button>
      </div>

      <div class="field">
        <div class="field-label-row">
          <span class="field-label">提示词</span>
          <button v-if="onEnhance" type="button" class="link-btn" :disabled="enhancing || !form.prompt.trim()" @click="doEnhance">
            {{ enhancing ? 'AI 改写中…' : '✨ AI 改写丰富' }}
          </button>
        </div>
        <textarea v-model="form.prompt" class="textarea" rows="4" placeholder="描述这一镜画面" required />
      </div>

      <div v-if="availableCharacters.length > 0" class="field">
        <div class="field-label-row">
          <span class="field-label">参考角色</span>
          <div class="quick-actions">
            <button type="button" class="link-btn" @click="selectAll">全选</button>
            <span class="dot">·</span>
            <button type="button" class="link-btn" @click="selectNone">空镜（不选）</button>
            <span class="dot">·</span>
            <button type="button" class="link-btn" @click="selectAuto">自动</button>
          </div>
        </div>
        <div class="char-grid">
          <button
            v-for="ch in availableCharacters"
            :key="ch.id"
            type="button"
            class="char-chip"
            :class="{ active: selectedCharIds.includes(ch.id) }"
            :disabled="autoMode"
            @click="toggleChar(ch.id)"
          >
            <div class="char-avatar">
              <img v-if="ch.image_url || ch.imageUrl" :src="'/' + (ch.image_url || ch.imageUrl)" alt="" />
              <span v-else class="char-avatar-fallback">{{ ch.name?.[0] || '?' }}</span>
            </div>
            <div class="char-meta">
              <div class="char-name">{{ ch.name }}</div>
              <div v-if="ch.role" class="char-role">{{ ch.role }}</div>
            </div>
            <div class="char-check">
              <span v-if="selectedCharIds.includes(ch.id) && !autoMode" class="check">✓</span>
            </div>
          </button>
        </div>
        <div v-if="autoMode" class="hint">系统会根据场景/分镜自动选择最相关的角色</div>
        <div v-else-if="selectedCharIds.length === 0" class="hint hint-warn">空镜模式：不会包含任何角色形象</div>
        <div v-else class="hint">已选 {{ selectedCharIds.length }} 个角色作为形象参考</div>
      </div>

      <div class="actions">
        <button type="button" class="btn" @click="close">取消</button>
        <button type="submit" class="btn btn-primary" :disabled="loading || !form.prompt.trim()">
          <span v-if="!loading">生成</span>
          <span v-else>生成中...</span>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '自定义生成' },
  subtitle: { type: String, default: '' },
  defaultPrompt: { type: String, default: '' },
  characters: { type: Array, default: () => [] },
  /** Default selected character IDs (e.g. characters auto-detected for this shot) */
  defaultCharIds: { type: Array, default: () => null },  // null = auto mode
  /** 可选：传入则显示「AI 改写」按钮。async (currentPrompt) => newPrompt */
  onEnhance: { type: Function, default: null },
})

const emit = defineEmits(['close', 'submit'])

const loading = ref(false)
const enhancing = ref(false)
const form = reactive({ prompt: '' })

async function doEnhance() {
  if (!props.onEnhance || enhancing.value) return
  enhancing.value = true
  try {
    const result = await props.onEnhance(form.prompt.trim())
    if (result && typeof result === 'string') form.prompt = result
  } finally {
    enhancing.value = false
  }
}

// selectedCharIds: [] = explicit none, [ids] = explicit selection
// autoMode: when true, ignore selection — backend will auto-detect
const autoMode = ref(true)
const selectedCharIds = ref([])

const availableCharacters = computed(() => props.characters || [])

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    form.prompt = props.defaultPrompt || ''
    if (Array.isArray(props.defaultCharIds)) {
      autoMode.value = false
      selectedCharIds.value = [...props.defaultCharIds]
    } else {
      autoMode.value = true
      selectedCharIds.value = availableCharacters.value.map(c => c.id)
    }
    loading.value = false
  }
})

function toggleChar(id) {
  if (autoMode.value) autoMode.value = false
  const i = selectedCharIds.value.indexOf(id)
  if (i >= 0) selectedCharIds.value.splice(i, 1)
  else selectedCharIds.value.push(id)
}
function selectAll() {
  autoMode.value = false
  selectedCharIds.value = availableCharacters.value.map(c => c.id)
}
function selectNone() {
  autoMode.value = false
  selectedCharIds.value = []
}
function selectAuto() {
  autoMode.value = true
  selectedCharIds.value = availableCharacters.value.map(c => c.id)
}

function close() {
  if (!loading.value) emit('close')
}

async function onSubmit() {
  loading.value = true
  try {
    await emit('submit', {
      prompt: form.prompt.trim(),
      // null = auto, array (even empty) = explicit
      referenceCharacterIds: autoMode.value ? null : [...selectedCharIds.value],
    })
    emit('close')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed; inset: 0;
  background: rgba(35, 48, 74, 0.32);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  animation: fadeIn 0.18s var(--ease-out);
}
@keyframes fadeIn { from{opacity:0} to{opacity:1} }

.modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 24px 26px;
  display: flex; flex-direction: column; gap: 16px;
  animation: scaleIn 0.2s var(--ease-out);
}
@keyframes scaleIn { from{opacity:0; transform:scale(.96)} to{opacity:1; transform:scale(1)} }

.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.kicker {
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.14em; color: var(--accent-text);
  margin-bottom: 4px;
}
.title { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--text-0); margin-bottom: 4px; }
.sub { font-size: 12.5px; color: var(--text-3); }

.field { display: flex; flex-direction: column; gap: 8px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.field-label-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

.quick-actions { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
.link-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 11.5px; color: var(--accent-text); font-weight: 600;
  text-decoration: none;
}
.link-btn:hover { text-decoration: underline; }
.dot { color: var(--text-3); }

.char-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 2px;
}
.char-chip {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px;
  background: var(--bg-0);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  font-family: var(--font-body);
}
.char-chip:hover:not(:disabled) { border-color: var(--border-strong); background: var(--bg-1); }
.char-chip.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.char-chip:disabled { opacity: 0.65; cursor: not-allowed; }

.char-avatar {
  width: 32px; height: 32px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
}
.char-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.char-avatar-fallback {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-2);
  font-size: 14px;
}
.char-meta { flex: 1; min-width: 0; }
.char-name { font-size: 13px; font-weight: 600; color: var(--text-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-role { font-size: 10.5px; color: var(--text-3); }
.char-check {
  width: 16px;
  display: flex; align-items: center; justify-content: center;
}
.check {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--accent);
  color: #0a0e1a;
  font-size: 10.5px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

.hint { font-size: 11.5px; color: var(--text-3); margin-top: 4px; }
.hint-warn { color: var(--warning); font-weight: 500; }

.actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
</style>
