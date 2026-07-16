<template>
  <div class="redeem-card">
    <div class="redeem-title">输入学习卡兑换码</div>
    <div class="redeem-hint">请在抖音或购买平台订单中查看学习卡兑换码</div>
    <form class="redeem-form" @submit.prevent="submit">
      <input
        v-model="code"
        class="redeem-input"
        type="text"
        placeholder="ZZK-XXXX-XXXX-XXXX"
        autocomplete="off"
        spellcheck="false"
        maxlength="22"
        @input="onInput"
      />
      <button type="submit" class="redeem-btn" :disabled="submitting || !code.trim()">
        {{ submitting ? '兑换中…' : '立即兑换' }}
      </button>
    </form>
    <div v-if="error" class="redeem-error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { learningAPI } from '~/composables/useApi'
import { useAuth } from '~/composables/useAuth'

const props = defineProps({ prefill: { type: String, default: '' } })
const emit = defineEmits(['redeemed'])

const { setCredits } = useAuth()
const code = ref(props.prefill || '')
const submitting = ref(false)
const error = ref('')

function onInput() {
  // 视觉规范化：大写 + 自动补分组连字符
  const raw = code.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 15)
  const parts = [raw.slice(0, 3), raw.slice(3, 7), raw.slice(7, 11), raw.slice(11, 15)].filter(Boolean)
  code.value = parts.join('-')
  error.value = ''
}

async function submit() {
  if (submitting.value || !code.value.trim()) return
  submitting.value = true
  error.value = ''
  try {
    const res = await learningAPI.redeem(code.value.trim())
    if (res.status === 'already_redeemed') {
      toast.success('这张卡你已经兑换过了，课程已是开通状态')
    } else {
      setCredits(res.balance)
      toast.success(res.credits_added > 0
        ? `兑换成功！课程已开通，${res.credits_added.toLocaleString()} 积分已到账`
        : '兑换成功！课程已开通')
    }
    emit('redeemed', res)
  } catch (e) {
    error.value = e.message || '兑换失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.redeem-card {
  border: 1.5px dashed var(--accent-dark, #5da817);
  background: var(--accent-bg, rgba(143,239,38,0.14));
  border-radius: 14px;
  padding: 20px 22px;
}
.redeem-title { font-size: 16px; font-weight: 700; color: var(--text-0, #182132); }
.redeem-hint { font-size: 12px; color: var(--text-2, #60718a); margin: 4px 0 12px; }
.redeem-form { display: flex; gap: 10px; flex-wrap: wrap; }
.redeem-input {
  flex: 1; min-width: 220px; height: 44px; padding: 0 14px;
  border: 1px solid var(--border, #dbe4f0); border-radius: 10px;
  background: var(--bg-0, #fff);
  font-size: 16px; letter-spacing: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-0, #182132);
}
.redeem-input:focus { outline: none; border-color: var(--accent, #8FEF26); }
.redeem-btn {
  height: 44px; padding: 0 22px; border: none; border-radius: 10px;
  background: var(--accent, #8FEF26); color: var(--accent-text, #2d5008);
  font-size: 14px; font-weight: 700; cursor: pointer;
}
.redeem-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.redeem-error { margin-top: 8px; font-size: 12px; color: #e5484d; }
</style>
