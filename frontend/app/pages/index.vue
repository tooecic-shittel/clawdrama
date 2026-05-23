<template>
  <div class="landing">
    <!-- ================ HERO ================ -->
    <section class="hero">
      <div class="hero-mesh"></div>
      <div class="hero-grid"></div>
      <div class="hero-glow hero-glow-1"></div>
      <div class="hero-glow hero-glow-2"></div>

      <div class="hero-inner">
        <div class="hero-badge">
          <span class="badge-dot"></span>
          <span>AI 短剧自动化生产平台</span>
          <span class="badge-divider">·</span>
          <span class="badge-version">v2.0</span>
        </div>

        <h1 class="hero-title">
          <span class="title-line">让 AI</span>
          <span class="title-line title-accent">为你拍短剧</span>
        </h1>

        <p class="hero-desc">
          从剧本到成片，全流程 AI 驱动。<br/>
          自动拆解分镜、生成角色、合成视频，分钟级产出一集精品短剧。
        </p>

        <div class="hero-cta">
          <template v-if="isAuthenticated">
            <NuxtLink to="/projects" class="btn-cta btn-cta-primary">
              <span>进入工作台</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </NuxtLink>
            <button class="btn-cta btn-cta-ghost" @click="scrollTo('showcase')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>观看作品</span>
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/register" class="btn-cta btn-cta-primary">
              <span>免费注册</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </NuxtLink>
            <NuxtLink to="/login" class="btn-cta btn-cta-ghost">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              <span>登录</span>
            </NuxtLink>
          </template>
        </div>

        <div class="hero-stats">
          <div class="stat">
            <div class="stat-num">5<span class="stat-suffix">+</span></div>
            <div class="stat-label">AI Agents</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-num">10<span class="stat-suffix">+</span></div>
            <div class="stat-label">多厂商模型</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-num">∞</div>
            <div class="stat-label">创意无限</div>
          </div>
        </div>

        <!-- Product preview mockup -->
        <div class="hero-mockup">
          <div class="mockup-glow"></div>
          <div class="mockup-window">
            <div class="mockup-titlebar">
              <span class="mock-dot mock-dot-r"></span>
              <span class="mock-dot mock-dot-y"></span>
              <span class="mock-dot mock-dot-g"></span>
              <div class="mock-url">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>app.clawdrama.com/workbench/<b>都市悬疑《时光邮局》</b> / 第 1 集</span>
              </div>
              <div class="mock-tabs">
                <span class="mock-tab">EP 1</span>
                <span class="mock-tab">EP 2</span>
                <span class="mock-tab mock-tab-add">+</span>
              </div>
            </div>
            <div class="mockup-body">
              <aside class="mock-sidebar">
                <div class="mock-side-section">
                  <span class="mock-side-label">PROJECT</span>
                  <div class="mock-side-item">
                    <span class="mock-side-ic">📝</span><span>剧本</span><span class="mock-tick">✓</span>
                  </div>
                  <div class="mock-side-item mock-side-active">
                    <span class="mock-side-ic">🎬</span><span>分镜</span><span class="mock-progress">8/12</span>
                  </div>
                  <div class="mock-side-item">
                    <span class="mock-side-ic">🎭</span><span>角色</span><span class="mock-tick">✓</span>
                  </div>
                  <div class="mock-side-item">
                    <span class="mock-side-ic">🎥</span><span>视频</span>
                  </div>
                  <div class="mock-side-item">
                    <span class="mock-side-ic">🎵</span><span>配音</span>
                  </div>
                </div>
                <div class="mock-side-section">
                  <span class="mock-side-label">AGENTS</span>
                  <div class="mock-agent-pill"><span class="mock-pulse"></span>storyboard_breaker</div>
                  <div class="mock-agent-pill mock-agent-idle">extractor</div>
                </div>
              </aside>
              <main class="mock-main">
                <div class="mock-toolbar">
                  <span class="mock-pill mock-pill-active"><span class="mock-pulse"></span>生成中 8/12</span>
                  <span class="mock-pill">12 分镜</span>
                  <span class="mock-pill">3 角色</span>
                  <span class="mock-pill mock-pill-ghost">导出</span>
                </div>
                <div class="mock-shots">
                  <div v-for="i in 6" :key="i" class="mock-shot" :class="{ 'mock-shot-loading': i === 6 }">
                    <div class="mock-shot-frame" :style="{ background: shotGradients[i - 1] }">
                      <span class="mock-shot-num">{{ String(i).padStart(2, '0') }}</span>
                      <span v-if="i === 6" class="mock-shot-spinner"></span>
                      <span v-else-if="i < 5" class="mock-shot-check">✓</span>
                    </div>
                    <div class="mock-shot-line line-full"></div>
                    <div class="mock-shot-line line-short"></div>
                  </div>
                </div>
              </main>
            </div>
          </div>
          <div class="mockup-floats">
            <div class="float-card float-card-1">
              <div class="float-row"><span class="float-dot float-dot-green"></span><span>剧本解析完成</span></div>
              <div class="float-small">12 分镜 · 3 角色</div>
            </div>
            <div class="float-card float-card-2">
              <div class="float-row"><span class="float-spin"></span><span>视频生成中</span></div>
              <div class="float-bar"><div class="float-bar-fill"></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================ WORKFLOW ================ -->
    <section class="section workflow workflow-section" id="workflow">
      <div class="section-head">
        <span class="section-eyebrow">WORKFLOW</span>
        <h2 class="section-title">四步生成一部短剧</h2>
        <p class="section-desc">从一段小说文本，到一集成片视频。完整的 AI 流水线，每一步都可干预、可定制。</p>
      </div>

      <div class="workflow-grid">
        <div
          v-for="(step, i) in workflow"
          :key="i"
          v-reveal="{ delay: i * 80 }"
          class="step-card"
        >
          <div class="step-head">
            <div class="step-icon" v-html="step.icon"></div>
            <div class="step-num">0{{ i + 1 }}</div>
          </div>

          <!-- Mini preview content per step -->
          <div class="step-preview">
            <!-- 01: Script preview -->
            <template v-if="i === 0">
              <div class="prev-script">
                <div class="prev-script-head">EP1 · SCENE 03</div>
                <div class="prev-script-line"><span class="prev-script-name">林小染</span><span class="prev-script-text">你是说，这个邮筒——</span></div>
                <div class="prev-script-line"><span class="prev-script-name">老板</span><span class="prev-script-text">只在每个月的 15 号出现。</span></div>
                <div class="prev-script-dot"></div>
              </div>
            </template>
            <!-- 02: Character avatars -->
            <template v-else-if="i === 1">
              <div class="prev-chars">
                <div class="prev-char prev-char-1"><span>林</span></div>
                <div class="prev-char prev-char-2"><span>陈</span></div>
                <div class="prev-char prev-char-3"><span>老</span></div>
                <div class="prev-char prev-char-plus">+2</div>
              </div>
              <div class="prev-tags">
                <span class="prev-tag">3 主角</span>
                <span class="prev-tag">2 配角</span>
              </div>
            </template>
            <!-- 03: Storyboard mini grid -->
            <template v-else-if="i === 2">
              <div class="prev-shots">
                <div v-for="n in 4" :key="n" class="prev-shot" :class="{ 'prev-shot-active': n === 2 }">
                  <span class="prev-shot-n">{{ String(n).padStart(2,'0') }}</span>
                </div>
              </div>
            </template>
            <!-- 04: Progress / video -->
            <template v-else>
              <div class="prev-video">
                <div class="prev-video-thumb">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
                <div class="prev-video-meta">
                  <div class="prev-video-title">01:32 · 1080p</div>
                  <div class="prev-bar"><div class="prev-bar-fill"></div></div>
                </div>
              </div>
            </template>
          </div>

          <h3 class="step-title">{{ step.title }}</h3>
          <p class="step-desc">{{ step.desc }}</p>
          <div class="step-agent">
            <span class="agent-dot"></span>
            <span>{{ step.agent }}</span>
          </div>
        </div>
      </div>

      <!-- Workflow footer strip -->
      <div class="workflow-stats">
        <div class="wf-stat">
          <span class="wf-stat-num">~5 min</span>
          <span class="wf-stat-label">单集生成时间</span>
        </div>
        <span class="wf-stat-divider"></span>
        <div class="wf-stat">
          <span class="wf-stat-num">12 - 30</span>
          <span class="wf-stat-label">单集分镜数</span>
        </div>
        <span class="wf-stat-divider"></span>
        <div class="wf-stat">
          <span class="wf-stat-num">1080p</span>
          <span class="wf-stat-label">默认输出</span>
        </div>
        <span class="wf-stat-divider"></span>
        <div class="wf-stat">
          <span class="wf-stat-num">100%</span>
          <span class="wf-stat-label">本地化存储</span>
        </div>
      </div>
    </section>

    <!-- ================ SHOWCASE ================ -->
    <section class="section showcase" id="showcase">
      <div class="section-head">
        <span class="section-eyebrow">SHOWCASE</span>
        <h2 class="section-title">由 ClawDrama 生成</h2>
        <p class="section-desc">无需任何后期，AI 自动完成剧本、分镜、配音、视频与剪辑。</p>
      </div>

      <div class="showcase-grid">
        <div
          v-for="(w, i) in works"
          :key="i"
          v-reveal="{ delay: i * 100 }"
          class="work-card"
        >
          <div class="work-video">
            <video :src="w.video" :poster="w.poster" controls preload="metadata" playsinline></video>
            <div class="work-play">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          <div class="work-info">
            <div class="work-meta">
              <span class="work-tag">{{ w.style }}</span>
              <span class="work-duration">{{ w.duration }}</span>
            </div>
            <h3 class="work-title">{{ w.title }}</h3>
            <p class="work-desc">{{ w.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ================ FEATURES (BENTO) ================ -->
    <section class="section features">
      <div class="section-head">
        <span class="section-eyebrow">CAPABILITIES</span>
        <h2 class="section-title">为短剧而生的工具集</h2>
      </div>

      <div class="bento-grid">
        <!-- Hero card: multi-provider -->
        <div v-reveal class="bento-card bento-hero">
          <div class="bento-inner">
            <div class="bento-eyebrow">FLEXIBLE</div>
            <h3 class="bento-title">10+ 模型厂商<br/>一键切换</h3>
            <p class="bento-desc">OpenAI、Gemini、MiniMax、火山引擎、阿里、Vidu —— 文本、图片、视频、TTS 全链路自由选择，按场景挑选最优模型。</p>
            <div class="provider-cluster">
              <span class="provider-chip">OpenAI</span>
              <span class="provider-chip">Gemini</span>
              <span class="provider-chip provider-chip-accent">MiniMax</span>
              <span class="provider-chip">Volcano</span>
              <span class="provider-chip">Vidu</span>
              <span class="provider-chip">Qwen</span>
            </div>
          </div>
        </div>

        <!-- TTS card with mock waveform -->
        <div v-reveal="{ delay: 80 }" class="bento-card bento-tts">
          <div class="bento-inner">
            <div class="bento-eyebrow">VOICE</div>
            <h3 class="bento-title-sm">智能 TTS 配音</h3>
            <p class="bento-desc-sm">按角色性别、年龄、性格自动分配音色</p>
          </div>
          <div class="waveform">
            <span v-for="i in 28" :key="i" class="wave-bar" :style="{ height: waveHeights[i % waveHeights.length] + '%', animationDelay: (i * 0.06) + 's' }"></span>
          </div>
        </div>

        <!-- Grid card with 3x3 visual -->
        <div v-reveal="{ delay: 160 }" class="bento-card bento-grid-card">
          <div class="bento-inner">
            <div class="bento-eyebrow">BATCH</div>
            <h3 class="bento-title-sm">宫格图批量生成</h3>
            <p class="bento-desc-sm">九宫格、四宫格自动切分到分镜</p>
          </div>
          <div class="grid-viz">
            <span v-for="i in 9" :key="i" class="grid-cell" :class="{ 'grid-cell-active': [2, 4, 5, 7].includes(i) }"></span>
          </div>
        </div>

        <!-- Frame types card -->
        <div v-reveal="{ delay: 240 }" class="bento-card bento-frames">
          <div class="bento-inner">
            <div class="bento-eyebrow">CONTROL</div>
            <h3 class="bento-title-sm">三种帧类型</h3>
            <p class="bento-desc-sm">首帧 / 尾帧 / 分镜板，精确控质感</p>
          </div>
          <div class="frame-strip">
            <div class="frame-cell frame-cell-1">F</div>
            <div class="frame-cell frame-cell-2">L</div>
            <div class="frame-cell frame-cell-3">S</div>
          </div>
        </div>

        <!-- Storage card -->
        <div v-reveal="{ delay: 280 }" class="bento-card bento-storage">
          <div class="bento-inner">
            <div class="bento-eyebrow">RELIABLE</div>
            <h3 class="bento-title-sm">本地化存储</h3>
            <p class="bento-desc-sm">素材本地落盘，资源永不失效</p>
          </div>
          <div class="storage-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
        </div>

        <!-- Export wide card -->
        <div v-reveal="{ delay: 320 }" class="bento-card bento-export">
          <div class="bento-inner">
            <div class="bento-eyebrow">ONE-CLICK</div>
            <h3 class="bento-title-sm">整集一键导出</h3>
            <p class="bento-desc-sm">FFmpeg 自动合成视频 + 字幕 + 配音</p>
            <div class="export-progress">
              <div class="export-step">剧本</div>
              <span class="export-arrow">→</span>
              <div class="export-step">分镜</div>
              <span class="export-arrow">→</span>
              <div class="export-step">视频</div>
              <span class="export-arrow">→</span>
              <div class="export-step export-step-done">成片</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================ CTA ================ -->
    <section class="cta-section">
      <div class="cta-mesh"></div>
      <div class="cta-inner">
        <h2 class="cta-title">开始你的第一部 AI 短剧</h2>
        <p class="cta-desc">几分钟即可上手，告别繁琐的传统流程。</p>
        <NuxtLink :to="isAuthenticated ? '/projects' : '/register'" class="btn-cta btn-cta-primary btn-cta-lg">
          <span>{{ isAuthenticated ? '立即创作' : '免费注册' }}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <img :src="footerLogo" alt="ClawDrama" class="footer-logo" />
          <div>
            <div class="footer-name">爪爪短剧 · ClawDrama</div>
            <div class="footer-tag">让 AI 帮我们做更有创造力的事</div>
          </div>
        </div>
        <div class="footer-copy">© {{ year }} ClawDrama. All rights reserved.</div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import footerLogo from '~/assets/claw-logo.svg'
import { useAuth } from '~/composables/useAuth'

const { isAuthenticated } = useAuth()
const year = new Date().getFullYear()

const shotGradients = [
  'linear-gradient(135deg, #2a3344 0%, #0a0e1a 100%)',
  'linear-gradient(135deg, #1f2738 0%, #0a0e1a 100%)',
  'linear-gradient(135deg, #2a3344 0%, #131a2f 100%)',
  'linear-gradient(135deg, #1f2738 0%, #0a0e1a 100%)',
  'linear-gradient(135deg, #2a3344 0%, #0a0e1a 100%)',
  'linear-gradient(135deg, #131a2f 0%, #050810 100%)',
]

const waveHeights = [20, 45, 70, 90, 60, 35, 80, 50, 25, 65, 85, 40, 55, 30, 75, 95, 50, 30]

function scrollTo(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const workflow = [
  {
    title: '剧本改写',
    desc: '上传小说或大纲，AI 自动改写为标准短剧格式，分场分镜结构化。',
    agent: 'script_rewriter',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>'
  },
  {
    title: '角色提取',
    desc: '智能识别角色与场景，去重合并，并自动分配音色与视觉风格。',
    agent: 'extractor + voice_assigner',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  },
  {
    title: '分镜拆解',
    desc: '剧本自动拆为分镜序列，生成首尾帧描述与运镜提示。',
    agent: 'storyboard_breaker',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
  },
  {
    title: '视频合成',
    desc: '图生视频 + TTS 配音 + FFmpeg 剪辑，自动产出可发布的完整成片。',
    agent: 'grid_prompt_generator',
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
  }
]

const works = [
  {
    title: '都市悬疑短剧 · 时光邮局',
    desc: 'AI 生成的悬疑题材短剧，电影级运镜与光影。',
    style: '电影感',
    duration: '01:32',
    video: 'https://ffile.chatfire.site/cf/public/20260114094337396.mp4',
    poster: ''
  },
  {
    title: '动漫风格短剧 · 樱花物语',
    desc: '日系动漫画风，由 AI 自动配音与剪辑生成。',
    style: '动漫',
    duration: '01:48',
    video: 'https://ffile.chatfire.site/cf/public/fcede75e8aeafe22031dbf78f86285b8.mp4',
    poster: ''
  }
]

const features = [
  {
    title: '多厂商模型适配',
    desc: 'OpenAI、Gemini、MiniMax、火山引擎、阿里、Vidu，一键切换。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"/></svg>'
  },
  {
    title: '宫格图生成',
    desc: '九宫格 / 四宫格批量出图，自动切分分配到分镜。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>'
  },
  {
    title: 'TTS 智能配音',
    desc: '根据角色性别、年龄、性格自动分配音色，支持多角色对话。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>'
  },
  {
    title: '帧类型控制',
    desc: '首帧 / 尾帧 / 分镜板三种帧类型，精确控制镜头质感。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 18v2M10 18v2M14 18v2M18 18v2M6 4v2M10 4v2M14 4v2M18 4v2"/></svg>'
  },
  {
    title: '本地化存储',
    desc: '所有素材本地落盘，不依赖外部链接，资源永不失效。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
  },
  {
    title: '一键整集导出',
    desc: 'FFmpeg 自动合成音视频 + 字幕，单镜头到整集无缝拼接。',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  }
]
</script>

<style scoped>
.landing {
  height: 100%;
  overflow-y: auto;
  scroll-behavior: smooth;
  background: #fafbfc;
  color: var(--text-0);
}

/* =========================================================
 * HERO — Dark, dramatic, cinematic
 * ========================================================= */
.hero {
  position: relative;
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px 64px;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(143,239,38,0.10), transparent 50%),
    radial-gradient(ellipse 70% 50% at 80% 80%, rgba(143,239,38,0.08), transparent 50%),
    linear-gradient(180deg, #ffffff 0%, #f6f8fb 50%, #fafbfc 100%);
  color: var(--text-0);
}

.hero-mesh {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(143,239,38,0.06), transparent 60%);
  pointer-events: none;
}

.hero-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(50,74,114,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(50,74,114,0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%);
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
  animation: float 14s ease-in-out infinite;
}
.hero-glow-1 {
  width: 520px; height: 520px;
  top: -160px; left: -120px;
  background: radial-gradient(circle, #C2F84E 0%, transparent 70%);
  opacity: 0.18;
}
.hero-glow-2 {
  width: 560px; height: 560px;
  bottom: -200px; right: -140px;
  background: radial-gradient(circle, #8FEF26 0%, transparent 70%);
  opacity: 0.14;
  animation-delay: -7s;
}
@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(20px, -30px); }
}

.hero-inner {
  position: relative;
  z-index: 2;
  max-width: 920px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  background: rgba(255,255,255,0.85);
  border: 1px solid var(--border);
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-1);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-sm);
  animation: fadeUp 0.6s var(--ease-out) both;
}
.badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #C2F84E;
  box-shadow: 0 0 8px #C2F84E;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.badge-divider { opacity: 0.4; }
.badge-version {
  font-family: var(--font-mono);
  color: #5da817;
  font-weight: 700;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(48px, 8vw, 88px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--text-0);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: fadeUp 0.7s var(--ease-out) 0.1s both;
}
.title-line { display: block; }
.title-accent {
  background: linear-gradient(135deg, #8FEF26 0%, #5da817 50%, #8FEF26 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background-size: 200% auto;
  animation: gradient-shift 6s ease infinite;
}
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.hero-desc {
  font-size: clamp(16px, 1.6vw, 19px);
  line-height: 1.7;
  color: var(--text-2);
  max-width: 620px;
  font-weight: 400;
  animation: fadeUp 0.7s var(--ease-out) 0.2s both;
}

.hero-cta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
  animation: fadeUp 0.7s var(--ease-out) 0.3s both;
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 14px 28px;
  font-size: 14.5px;
  font-weight: 600;
  border-radius: 99px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.25s var(--ease-out);
  font-family: var(--font-body);
  letter-spacing: 0.01em;
  border: 1px solid transparent;
}
.btn-cta-primary {
  background: linear-gradient(135deg, #C2F84E 0%, #8FEF26 100%);
  color: #0a0e1a;
  box-shadow:
    0 8px 24px rgba(143,239,38,0.35),
    0 2px 6px rgba(143,239,38,0.25),
    inset 0 1px 0 rgba(255,255,255,0.3);
}
.btn-cta-primary:hover {
  transform: translateY(-2px);
  box-shadow:
    0 14px 36px rgba(143,239,38,0.5),
    0 4px 10px rgba(143,239,38,0.3),
    inset 0 1px 0 rgba(255,255,255,0.4);
  filter: brightness(1.05);
}
.btn-cta-ghost {
  background: rgba(255,255,255,0.7);
  border-color: var(--border);
  color: var(--text-1);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-xs);
}
.btn-cta-ghost:hover {
  background: #fff;
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.btn-cta-lg {
  padding: 18px 36px;
  font-size: 16px;
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 12px;
  padding: 18px 28px;
  background: rgba(255,255,255,0.85);
  border: 1px solid var(--border);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-card);
  animation: fadeUp 0.7s var(--ease-out) 0.4s both;
}
.stat { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 88px; }
.stat-num {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  color: var(--text-0);
  letter-spacing: -0.02em;
  line-height: 1;
}
.stat-suffix {
  color: #5da817;
  margin-left: 2px;
}
.stat-label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.stat-divider {
  width: 1px; height: 28px;
  background: var(--border);
}

/* =========================================================
 * HERO PRODUCT MOCKUP
 * ========================================================= */
.hero-mockup {
  position: relative;
  width: 100%;
  max-width: 980px;
  margin-top: 36px;
  animation: fadeUp 0.9s var(--ease-out) 0.6s both;
  perspective: 1600px;
}
.mockup-glow {
  position: absolute;
  inset: -40px -60px 20px -60px;
  background:
    radial-gradient(ellipse 60% 70% at 50% 50%, rgba(194,248,78,0.16), transparent 60%);
  filter: blur(28px);
  pointer-events: none;
  z-index: 0;
}
.mockup-window {
  position: relative;
  z-index: 1;
  background: linear-gradient(180deg, #131a2f 0%, #0a0e1a 100%);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 30px 80px rgba(5,8,16,0.65),
    0 12px 32px rgba(5,8,16,0.45),
    inset 0 1px 0 rgba(255,255,255,0.06);
  transform: rotateX(2deg);
  transform-origin: top center;
}
.mockup-titlebar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.mock-dot {
  width: 11px; height: 11px;
  border-radius: 50%;
  display: inline-block;
}
.mock-dot-r { background: #ff5f57; }
.mock-dot-y { background: #febc2e; }
.mock-dot-g { background: #28c840; }
.mock-url {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
  margin: 0 14px;
  padding: 5px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mock-url svg { color: #C2F84E; flex-shrink: 0; }
.mock-url b { color: rgba(255,255,255,0.85); font-weight: 500; }
.mock-tabs { display: flex; gap: 5px; }
.mock-tab {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 9px;
  background: rgba(194,248,78,0.12);
  color: #C2F84E;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
.mock-tab:nth-child(2) { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); }
.mock-tab-add {
  background: rgba(255,255,255,0.04) !important;
  color: rgba(255,255,255,0.4) !important;
  width: 22px;
  text-align: center;
  padding: 4px 0;
}

.mockup-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 360px;
}

/* Sidebar */
.mock-sidebar {
  padding: 16px 12px;
  background: rgba(0,0,0,0.2);
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column; gap: 22px;
}
.mock-side-section { display: flex; flex-direction: column; gap: 4px; }
.mock-side-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.35);
  padding: 0 8px;
  margin-bottom: 4px;
}
.mock-side-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: rgba(255,255,255,0.65);
  border-radius: 6px;
  border-left: 2px solid transparent;
}
.mock-side-active {
  background: rgba(194,248,78,0.08);
  color: #fff;
  border-left-color: #C2F84E;
  font-weight: 600;
}
.mock-side-ic { font-size: 13px; line-height: 1; }
.mock-tick {
  margin-left: auto;
  font-size: 10px;
  color: #C2F84E;
  font-weight: 700;
}
.mock-progress {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #C2F84E;
  font-weight: 600;
}
.mock-agent-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(194,248,78,0.2);
  border-radius: 99px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #C2F84E;
}
.mock-agent-idle {
  border-color: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
}
.mock-pulse {
  width: 6px; height: 6px;
  background: #C2F84E;
  border-radius: 50%;
  box-shadow: 0 0 6px #C2F84E;
  animation: pulse 1.6s ease-in-out infinite;
}

/* Main canvas */
.mock-main {
  padding: 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.mock-toolbar {
  display: flex; align-items: center; gap: 8px;
}
.mock-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px;
  font-size: 11px;
  border-radius: 99px;
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.65);
  border: 1px solid rgba(255,255,255,0.06);
  font-family: var(--font-body);
}
.mock-pill-active {
  background: rgba(194,248,78,0.12);
  border-color: rgba(194,248,78,0.3);
  color: #C2F84E;
  font-weight: 600;
}
.mock-pill-ghost {
  margin-left: auto;
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.65);
}

.mock-shots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.mock-shot {
  display: flex; flex-direction: column; gap: 6px;
}
.mock-shot-frame {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 6px;
  display: flex; align-items: flex-end; justify-content: flex-start;
  padding: 8px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}
.mock-shot-frame::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%);
}
.mock-shot-num {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.08em;
  position: relative;
  z-index: 1;
}
.mock-shot-check {
  position: absolute;
  top: 6px; right: 6px;
  width: 16px; height: 16px;
  background: #C2F84E;
  color: #0a0e1a;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  z-index: 1;
}
.mock-shot-loading .mock-shot-frame::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(194,248,78,0.15), transparent);
  animation: shimmer 1.6s linear infinite;
}
.mock-shot-spinner {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 18px; height: 18px;
  border: 2px solid rgba(194,248,78,0.25);
  border-top-color: #C2F84E;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  z-index: 1;
}
.mock-shot-line {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
}
.mock-shot-line.line-short { width: 60%; }

/* Floating cards */
.mockup-floats {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.float-card {
  position: absolute;
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(28,36,54,0.95), rgba(10,14,26,0.95));
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
  font-size: 12px;
  color: rgba(255,255,255,0.85);
  animation: floaty 4s ease-in-out infinite;
}
.float-card-1 { top: -10px; right: -30px; animation-delay: 0s; }
.float-card-2 { bottom: 12px; left: -36px; animation-delay: -2s; }
.float-row { display: flex; align-items: center; gap: 7px; font-weight: 600; }
.float-small {
  margin-top: 3px;
  font-size: 10.5px;
  color: rgba(255,255,255,0.5);
  font-family: var(--font-mono);
}
.float-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
}
.float-dot-green {
  background: #C2F84E;
  box-shadow: 0 0 8px #C2F84E;
}
.float-spin {
  width: 11px; height: 11px;
  border: 2px solid rgba(194,248,78,0.25);
  border-top-color: #C2F84E;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
.float-bar {
  margin-top: 7px;
  width: 120px; height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.float-bar-fill {
  height: 100%;
  width: 64%;
  background: linear-gradient(90deg, #C2F84E, #8FEF26);
  border-radius: 2px;
  animation: barGrow 3s ease-in-out infinite;
}
@keyframes floaty {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes barGrow {
  0%, 100% { width: 64%; }
  50% { width: 82%; }
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.mock-shot-spinner { animation: spin 0.9s linear infinite; }

/* =========================================================
 * SECTIONS — General
 * ========================================================= */
.section {
  padding: 96px 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.workflow-section { padding-top: 80px; }

.section-head {
  text-align: center;
  max-width: 720px;
  margin: 0 auto 56px;
}
.section-eyebrow {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #2d5008;
  margin-bottom: 14px;
  padding: 4px 12px;
  background: rgba(143,239,38,0.18);
  border: 1px solid rgba(143,239,38,0.32);
  border-radius: 99px;
}
.section-title {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 44px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
  margin-bottom: 14px;
  line-height: 1.2;
}
.section-desc {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-2);
  font-weight: 300;
}

/* =========================================================
 * WORKFLOW
 * ========================================================= */
.workflow {
  position: relative;
}
.workflow::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(143,239,38,0.18) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%);
  opacity: 0.4;
  pointer-events: none;
  z-index: 0;
}
.workflow > * { position: relative; z-index: 1; }

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  position: relative;
}
/* connector rail behind cards — dashed + flowing dot */
.workflow-grid::before {
  content: '';
  position: absolute;
  top: 72px;
  left: 13%;
  right: 13%;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    rgba(143,239,38,0.4) 0,
    rgba(143,239,38,0.4) 5px,
    transparent 5px,
    transparent 12px
  );
  z-index: 0;
}
.workflow-grid::after {
  content: '';
  position: absolute;
  top: 67px;
  left: 13%;
  width: 12px;
  height: 12px;
  background: #C2F84E;
  border-radius: 50%;
  box-shadow: 0 0 16px #C2F84E, 0 0 6px #fff inset;
  z-index: 1;
  animation: flowAlong 6s linear infinite;
}
@keyframes flowAlong {
  0% { left: 13%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { left: 87%; opacity: 0; }
}

.step-card {
  position: relative;
  z-index: 1;
  padding: 22px 22px 20px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
  transition: transform 0.3s var(--ease-out), border-color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out), opacity 0.7s, translate 0.7s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.step-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(143,239,38,0.06) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.step-card:hover {
  transform: translateY(-6px);
  border-color: rgba(143,239,38,0.5);
  box-shadow: 0 24px 56px rgba(143,239,38,0.15), 0 8px 20px rgba(50,74,114,0.08);
}
.step-card:hover::before { opacity: 1; }

@media (max-width: 880px) {
  .workflow-grid { grid-template-columns: repeat(2, 1fr); }
  .workflow-grid::before { display: none; }
}
@media (max-width: 520px) {
  .workflow-grid { grid-template-columns: 1fr; }
}

.step-num {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-3);
}
.step-icon {
  position: relative;
  z-index: 2;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background: #0a0e1a;
  color: #C2F84E;
  border-radius: 11px;
  transition: all 0.3s;
  box-shadow:
    0 4px 12px rgba(143,239,38,0.25),
    inset 0 1px 0 rgba(255,255,255,0.08);
}
.step-card:hover .step-icon {
  background: #0a0e1a;
  color: #C2F84E;
  transform: rotate(-6deg) scale(1.08);
  box-shadow:
    0 8px 20px rgba(143,239,38,0.4),
    inset 0 1px 0 rgba(255,255,255,0.12);
}
.step-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}
.step-desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-2);
  flex: 1;
}

/* === Step Preview Boxes === */
.step-preview {
  padding: 12px;
  background: linear-gradient(180deg, #f8faf6 0%, #f1f5ec 100%);
  border: 1px solid rgba(143,239,38,0.15);
  border-radius: 12px;
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* 01: Script preview */
.prev-script {
  width: 100%;
  font-size: 11px;
  color: var(--text-1);
  line-height: 1.5;
  font-family: var(--font-mono);
  position: relative;
}
.prev-script-head {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #2d5008;
  margin-bottom: 5px;
}
.prev-script-line {
  display: flex;
  gap: 6px;
  margin-bottom: 3px;
}
.prev-script-name {
  font-weight: 700;
  color: #0a0e1a;
  flex-shrink: 0;
  background: rgba(143,239,38,0.4);
  padding: 0 5px;
  border-radius: 3px;
}
.prev-script-text {
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prev-script-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #C2F84E;
  margin-top: 4px;
  animation: pulse 1.4s ease-in-out infinite;
}

/* 02: Character avatars */
.prev-chars {
  display: flex;
  align-items: center;
  gap: -6px;
}
.prev-char {
  width: 36px; height: 36px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  border: 2px solid #f8faf6;
  margin-right: -10px;
  box-shadow: 0 2px 6px rgba(50,74,114,0.15);
}
.prev-char-1 { background: linear-gradient(135deg, #2a3344, #0a0e1a); }
.prev-char-2 { background: linear-gradient(135deg, #3a4456, #1a2032); }
.prev-char-3 { background: linear-gradient(135deg, #C2F84E, #8FEF26); color: #0a0e1a; }
.prev-char-plus {
  width: 36px; height: 36px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #fff;
  border: 1px dashed #a8c990;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  color: #2d5008;
  margin-right: 0;
  margin-left: 4px;
}
.prev-tags {
  display: flex;
  gap: 5px;
  margin-left: 14px;
}
.prev-tag {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  padding: 2px 7px;
  background: #fff;
  border: 1px solid rgba(143,239,38,0.3);
  border-radius: 99px;
  color: var(--text-1);
}

/* 03: Storyboard grid */
.prev-shots {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  width: 100%;
}
.prev-shot {
  aspect-ratio: 1;
  background: linear-gradient(135deg, #2a3344, #0a0e1a);
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 3px;
  position: relative;
  overflow: hidden;
}
.prev-shot-active {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  box-shadow: 0 0 0 2px rgba(143,239,38,0.3);
}
.prev-shot-active::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent, rgba(255,255,255,0.2));
}
.prev-shot-n {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.06em;
  position: relative;
  z-index: 1;
}
.prev-shot-active .prev-shot-n { color: #0a0e1a; }

/* 04: Video preview */
.prev-video {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.prev-video-thumb {
  width: 44px; height: 32px;
  background: linear-gradient(135deg, #2a3344, #0a0e1a);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #C2F84E;
  flex-shrink: 0;
}
.prev-video-meta { flex: 1; min-width: 0; }
.prev-video-title {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 5px;
}
.prev-bar {
  height: 4px;
  background: rgba(143,239,38,0.15);
  border-radius: 2px;
  overflow: hidden;
}
.prev-bar-fill {
  height: 100%;
  width: 72%;
  background: linear-gradient(90deg, #C2F84E, #8FEF26);
  border-radius: 2px;
  animation: barGrow 3s ease-in-out infinite;
}

/* === Workflow stats footer === */
.workflow-stats {
  margin-top: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 22px 36px;
  background: linear-gradient(180deg, #fff, #fafbfc);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  max-width: 880px;
  margin-left: auto;
  margin-right: auto;
}
.wf-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wf-stat-num {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-0);
  letter-spacing: -0.02em;
  line-height: 1;
}
.wf-stat-label {
  font-size: 11.5px;
  color: var(--text-3);
  letter-spacing: 0.02em;
}
.wf-stat-divider {
  width: 1px; height: 32px;
  background: var(--border);
}
@media (max-width: 720px) {
  .workflow-stats { flex-wrap: wrap; gap: 18px; padding: 18px 20px; }
  .wf-stat-divider { display: none; }
}
.step-agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  width: 100%;
}
.agent-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #8FEF26;
  box-shadow: 0 0 6px #C2F84E;
}

/* =========================================================
 * SHOWCASE
 * ========================================================= */
.showcase { position: relative; }

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 28px;
}

.work-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.3s var(--ease-out), border-color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out), opacity 0.7s, translate 0.7s;
}
.work-card:hover {
  transform: translateY(-4px);
  border-color: rgba(143,239,38,0.5);
  box-shadow: 0 28px 64px rgba(143,239,38,0.15), 0 8px 20px rgba(50,74,114,0.08);
}

.work-video {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #0d1220;
  overflow: hidden;
}
.work-video video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.work-play {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 56px; height: 56px;
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  color: #0d1220;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.work-card:hover .work-play { opacity: 0; } /* hidden — video controls own */

.work-info { padding: 22px 24px 24px; }
.work-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.work-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  background: rgba(143,239,38,0.18);
  color: #2d5008;
  border: 1px solid rgba(143,239,38,0.32);
  border-radius: 99px;
}
.work-duration {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}
.work-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 6px;
}
.work-desc {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-2);
}

/* =========================================================
 * FEATURES — BENTO
 * ========================================================= */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: minmax(150px, auto);
  gap: 16px;
}
.bento-card {
  position: relative;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px;
  overflow: hidden;
  transition: transform 0.3s var(--ease-out), border-color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out), opacity 0.7s, translate 0.7s;
}
.bento-card:hover {
  border-color: rgba(143,239,38,0.5);
  transform: translateY(-4px);
  box-shadow: 0 20px 48px rgba(143,239,38,0.14), 0 6px 16px rgba(50,74,114,0.08);
}
.bento-inner {
  position: relative;
  z-index: 2;
}
.bento-eyebrow {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #2d5008;
  padding: 3px 8px;
  background: rgba(143,239,38,0.18);
  border: 1px solid rgba(143,239,38,0.32);
  border-radius: 99px;
  margin-bottom: 12px;
}
.bento-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-0);
  line-height: 1.25;
  letter-spacing: -0.01em;
  margin-bottom: 10px;
}
.bento-title-sm {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 6px;
}
.bento-desc {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-2);
  margin-bottom: 18px;
}
.bento-desc-sm {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
}

/* Bento Layout — 6 col grid */
.bento-hero {
  grid-column: span 3;
  grid-row: span 2;
  background:
    radial-gradient(circle at 100% 0%, rgba(143,239,38,0.1), transparent 50%),
    #ffffff;
}
.bento-tts { grid-column: span 3; }
.bento-grid-card { grid-column: span 3; }
.bento-frames { grid-column: span 2; }
.bento-storage { grid-column: span 2; }
.bento-export { grid-column: span 2; }

/* Provider chips cluster */
.provider-cluster {
  display: flex; flex-wrap: wrap; gap: 7px;
}
.provider-chip {
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 11px;
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 99px;
  transition: all 0.2s;
}
.provider-chip-accent {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(143,239,38,0.3);
}
.bento-hero:hover .provider-chip:not(.provider-chip-accent):nth-child(odd) {
  border-color: rgba(143,239,38,0.5);
  color: #2d5008;
}

/* Waveform */
.waveform {
  display: flex; align-items: flex-end;
  gap: 3px;
  height: 56px;
  margin-top: 16px;
}
.wave-bar {
  flex: 1;
  background: linear-gradient(180deg, #C2F84E, #8FEF26);
  border-radius: 2px;
  min-height: 6px;
  animation: waveDance 1.4s ease-in-out infinite;
  transform-origin: bottom;
}
@keyframes waveDance {
  0%, 100% { transform: scaleY(1); opacity: 0.85; }
  50% { transform: scaleY(0.4); opacity: 0.55; }
}

/* Grid 3x3 viz */
.grid-viz {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 16px;
  width: 90px;
  aspect-ratio: 1;
}
.grid-cell {
  background: var(--bg-2);
  border-radius: 3px;
  transition: background 0.3s;
}
.grid-cell-active {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  box-shadow: 0 2px 6px rgba(143,239,38,0.3);
}

/* Frame strip */
.frame-strip {
  display: flex;
  gap: 6px;
  margin-top: 16px;
}
.frame-cell {
  flex: 1;
  aspect-ratio: 4/3;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
  border: 1px solid rgba(255,255,255,0.1);
}
.frame-cell-1 {
  background: linear-gradient(135deg, #2a3344, #0a0e1a);
  color: rgba(255,255,255,0.65);
}
.frame-cell-2 {
  background: linear-gradient(135deg, #2a3344, #0a0e1a);
  color: rgba(255,255,255,0.65);
}
.frame-cell-3 {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-color: rgba(143,239,38,0.4);
}

/* Storage */
.storage-icon {
  color: #8FEF26;
  margin-top: 16px;
  opacity: 0.85;
}

/* Export progress */
.export-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.export-step {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 9px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 99px;
  color: var(--text-2);
}
.export-step-done {
  background: linear-gradient(135deg, #C2F84E, #8FEF26);
  color: #0a0e1a;
  border-color: transparent;
}
.export-arrow {
  color: var(--text-3);
  font-size: 11px;
}

/* Bento responsive */
@media (max-width: 920px) {
  .bento-grid { grid-template-columns: repeat(2, 1fr); }
  .bento-hero { grid-column: span 2; grid-row: span 1; }
  .bento-tts, .bento-grid-card, .bento-frames, .bento-storage, .bento-export {
    grid-column: span 1;
  }
  .bento-export { grid-column: span 2; }
}
@media (max-width: 560px) {
  .bento-grid { grid-template-columns: 1fr; }
  .bento-hero, .bento-tts, .bento-grid-card, .bento-frames, .bento-storage, .bento-export {
    grid-column: span 1;
  }
}

/* =========================================================
 * CTA
 * ========================================================= */
.cta-section {
  position: relative;
  padding: 96px 24px;
  margin: 48px 24px 0;
  border-radius: 32px;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 30%, rgba(143,239,38,0.22), transparent 50%),
    radial-gradient(circle at 70% 70%, rgba(143,239,38,0.14), transparent 50%),
    linear-gradient(135deg, #1a2032 0%, #0d1220 100%);
  border: 1px solid rgba(143,239,38,0.15);
  text-align: center;
  color: #fff;
}
.cta-mesh {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 70% 50% at 50% 50%, black 20%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 70% 50% at 50% 50%, black 20%, transparent 80%);
  pointer-events: none;
}
.cta-inner { position: relative; z-index: 2; max-width: 640px; margin: 0 auto; }
.cta-title {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 14px;
  line-height: 1.2;
}
.cta-desc {
  font-size: 17px;
  color: rgba(255,255,255,0.7);
  margin-bottom: 32px;
  font-weight: 300;
}

/* =========================================================
 * FOOTER — light
 * ========================================================= */
.footer {
  padding: 40px 24px 64px;
  border-top: 1px solid var(--border);
  margin-top: 48px;
}
.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}
.footer-brand { display: flex; align-items: center; gap: 14px; }
.footer-logo {
  width: 60px; height: 40px;
  padding: 6px 8px;
  background: linear-gradient(160deg, #1c2436, #0a0e1a);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 4px 12px rgba(143,239,38,0.18);
  object-fit: contain;
}
.footer-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-0);
}
.footer-tag {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
}
.footer-copy {
  font-size: 12.5px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 980px) {
  .hero-mockup { max-width: 100%; margin-top: 28px; }
  .mockup-body { grid-template-columns: 160px 1fr; min-height: 320px; }
  .mock-shots { gap: 8px; }
  .float-card-1 { top: -8px; right: -10px; }
  .float-card-2 { bottom: 8px; left: -12px; }
}

@media (max-width: 768px) {
  .hero { padding: 48px 20px; min-height: auto; }
  .section { padding: 64px 20px; }
  .hero-title { font-size: clamp(36px, 10vw, 56px) !important; }
  .hero-stats { gap: 12px; padding: 12px 16px; flex-wrap: wrap; justify-content: center; }
  .stat { min-width: 64px; }
  .stat-num { font-size: 22px; }
  .stat-divider { display: none; }
  .showcase-grid { grid-template-columns: 1fr; }
  .footer-inner { flex-direction: column; text-align: center; }
  .mockup-window { border-radius: 10px; }
  .mockup-titlebar { padding: 8px 10px; gap: 6px; }
  .mock-url { font-size: 9.5px; padding: 4px 8px; margin: 0 6px; }
  .mock-url span { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
  .mock-tabs { display: none; }
  .mockup-body { grid-template-columns: 1fr; }
  .mock-sidebar { display: none; }
  .mock-main { padding: 14px; }
  .float-card { display: none; }
  .cta-section { margin: 24px 12px 0; padding: 56px 20px; border-radius: 22px; }
  .cta-title { font-size: clamp(24px, 6vw, 32px) !important; }
  .btn-cta { padding: 12px 22px; font-size: 14px; }
  .btn-cta-lg { padding: 14px 28px; font-size: 15px; }
  .workflow-stats { padding: 16px 18px; gap: 14px; }
  .wf-stat-num { font-size: 18px; }
}

@media (max-width: 480px) {
  .hero { padding: 40px 16px; }
  .section { padding: 56px 16px; }
  .hero-cta { flex-direction: column; width: 100%; }
  .hero-cta > * { width: 100%; justify-content: center; }
  .hero-badge { font-size: 11px; padding: 6px 12px; flex-wrap: wrap; justify-content: center; }
  .hero-desc { font-size: 15px; }
  .section-title { font-size: clamp(26px, 8vw, 34px) !important; }
}
</style>
