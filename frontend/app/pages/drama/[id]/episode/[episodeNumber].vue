<template>
  <div class="studio" v-if="drama">
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回项目
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ drama.title }}</h1>
          <span class="studio-episode-chip">第 {{ episodeNumber }} 集</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/11</span>
            <span class="studio-meta-inline">{{ chars.length }} 角色 · {{ sbs.length }} 镜头</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
        <div class="studio-actions">
          <button class="btn" @click="refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            刷新
          </button>
          <button class="btn btn-primary" @click="panel = mergeUrl ? 'export' : (sbs.length ? 'production' : 'script')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ mergeUrl ? '查看成片' : (sbs.length ? '继续制作' : '开始制作') }}
          </button>
        </div>
      </div>
    </header>

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="sidebar">
      <nav class="pipeline">
        <div
          v-for="section in sidebarSections"
          :key="section.id"
          class="pipe-section"
        >
          <div class="pipe-section-label">{{ section.label }}</div>
          <div v-if="section.desc" class="pipe-section-desc">{{ section.desc }}</div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', { active: activeSubStepKey === item.key, done: item.done }]"
            @click="goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="item.done ? 'icon-done' : activeSubStepKey === item.key ? 'icon-active' : ''">
              <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Progress + Refresh -->
      <div class="sidebar-bottom">
        <div class="progress-wrap">
          <div class="progress-head">
            <span class="progress-label">制作进度</span>
            <span class="progress-val">{{ pipelineProgress }}/11</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: (pipelineProgress / 11 * 100) + '%' }"></div>
          </div>
        </div>
        <div class="sidebar-jumper" v-if="sidebarJumpSteps.length">
          <button
            v-for="step in sidebarJumpSteps"
            :key="step.key"
            :class="['sidebar-jump-dot', { active: activeSubStepKey === step.key, done: step.done }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="refresh-btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新数据
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
      <div v-if="activeSubSteps.length" class="stage-subnav">
        <button
          v-for="sub in activeSubSteps"
          :key="sub.key"
          :class="['stage-subnav-item', { active: activeSubStepKey === sub.key, done: sub.done }]"
          @click="goSubStep(sub.key)"
        >
          <span>{{ sub.label }}</span>
          <span v-if="sub.done" class="stage-subnav-dot"></span>
        </button>
      </div>

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <!-- Step 0: Raw Content -->
        <div v-if="scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">原始内容</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
              <button class="btn btn-sm" @click="saveRaw(); toast.success('已保存')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                保存
              </button>
            </div>
          </div>
          <textarea
            class="fill-textarea"
            v-model="localRaw"
            placeholder="粘贴小说原文、故事大纲或分镜描述..."
          />
        </div>

        <!-- Step 1: Rewrite -->
        <div v-else-if="scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">AI 改写</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="scriptLen" class="char-count">{{ scriptLen }} 字</span>
              <button v-if="rawContent" class="btn btn-sm" @click="skipRewrite">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过改写
              </button>
              <button v-if="scriptContent" class="btn btn-sm" @click="doRewrite" :disabled="rn">
                <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                重新改写
              </button>
            </div>
          </div>

          <div v-if="!scriptContent && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="empty-title">AI 改写为格式化剧本</div>
            <div class="empty-desc">根据你的原始内容选合适的模式 — 已有规范剧本就直接改写，小说/梗概会自动调用对应 Skill。</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" @click="doRewrite" title="把已经格式接近的剧本整理成标准格式">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                改写为剧本
              </button>
              <button class="btn" @click="doNovelToScript" title="把长篇小说拆解成多集短剧 + 输出第一集">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                小说转剧本
              </button>
              <button class="btn" @click="doScriptWrite" title="只用一句梗概让 AI 原创短剧">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
                AI 原创剧本
              </button>
              <button class="btn" @click="doScriptPolish" title="对已有剧本做节奏 / 对白 / 冲突优化">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
                润色剧本
              </button>
              <button class="btn btn-ghost" @click="skipRewrite" title="不改写，直接用原始内容">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过
              </button>
            </div>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent-dark)" />
            <div class="loading-text">正在改写剧本...</div>
          </div>
          <textarea v-else class="fill-textarea" v-model="localScript" placeholder="格式化剧本内容..." />
        </div>

        <!-- Step 2: Extract -->
        <div v-else-if="scriptStep === 2" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">03</span>
                <span class="step-name">提取角色与场景</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="chars.length" class="char-count">{{ chars.length }} 角色 · {{ scenes.length }} 场景</span>
              <button v-if="chars.length" class="btn btn-sm" @click="doExtract" :disabled="rn || extractConfirm.loading">
                <Loader2 v-if="extractConfirm.loading || (rn && rt === 'extractor')" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                重新提取
              </button>
            </div>
          </div>

          <div v-if="!chars.length && !rn && !extractConfirm.loading" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="empty-title">从剧本提取角色与场景</div>
            <div class="empty-desc">AI 自动分析剧本，提取角色信息和场景列表，与项目已有数据智能去重合并</div>
            <button class="btn btn-primary" :disabled="extractConfirm.loading" @click="doExtract">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              开始提取
            </button>
          </div>
          <div v-else-if="extractConfirm.loading || (rn && rt === 'extractor')" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent-dark)" />
            <div class="loading-text">正在分析角色匹配...</div>
          </div>
          <div v-else class="extract-stage">
            <aside class="card extract-summary">
              <div class="extract-summary-kicker">Extraction Board</div>
              <div class="extract-summary-title">角色与场景结果</div>
              <div class="extract-summary-desc">从剧本里提取出的角色和场景已经入库。这里先确认命名、定位和描述是否可直接进入后续制作。</div>
              <div class="extract-summary-stats">
                <div class="extract-summary-stat">
                  <span>角色</span>
                  <strong>{{ chars.length }}</strong>
                </div>
                <div class="extract-summary-stat">
                  <span>场景</span>
                  <strong>{{ scenes.length }}</strong>
                </div>
              </div>
              <div class="extract-summary-note">如果角色描述过于简短，后续设定性别和生成形象时建议先补充人物特征。</div>
            </aside>

            <div class="card extract-card">
              <div class="extract-card-head">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>角色</span>
                <span class="tag tag-accent">{{ chars.length }}</span>
              </div>
              <div class="extract-list">
                <div v-for="c in chars" :key="c.id" class="extract-row">
                  <div class="char-avatar">{{ c.name?.[0] || '?' }}</div>
                  <div class="extract-info">
                    <div class="extract-name-row">
                      <div class="extract-name">{{ c.name }}</div>
                      <span class="tag">{{ c.role || '角色' }}</span>
                    </div>
                    <div class="extract-meta wrap">{{ c.description || c.appearance || c.personality || '暂无描述' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card extract-card" v-if="scenes.length">
              <div class="extract-card-head">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>场景</span>
                <span class="tag tag-accent">{{ scenes.length }}</span>
              </div>
              <div class="extract-list">
                <div v-for="s in scenes" :key="s.id" class="extract-row">
                  <div class="scene-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div class="extract-info">
                    <div class="extract-name-row">
                      <div class="extract-name">{{ s.location }}</div>
                      <span v-if="s.time" class="tag">{{ s.time }}</span>
                    </div>
                    <div class="extract-meta wrap">{{ s.description || s.time || '等待补充场景描述' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Voice Assignment -->
        <div v-else-if="scriptStep === 3" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">04</span>
                <span class="step-name">分配性别</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="charsVoiced" class="char-count">{{ charsVoiced }}/{{ chars.length }} 已设性别</span>
              <label v-if="isAdmin && activeAudioConfig" class="dim" style="font-size:11px;margin-left:8px">TTS 模型</label>
              <select v-if="isAdmin && activeAudioConfig"
                :value="currentTTSModel"
                @change="changeTTSModel($event.target.value)"
                class="input"
                style="height:28px;font-size:12px;padding:0 8px;min-width:220px"
                :title="`当前：${currentTTSModel || '未设置'}（切换后旧的试听需重新生成才能听到新音色）`">
                <option v-for="opt in TTS_MODEL_PRESETS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <button v-if="charsVoiced" class="btn btn-sm" @click="doVoice" :disabled="rn">
                <Loader2 v-if="rn && rt === 'voice_assigner'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                重新判别
              </button>
            </div>
          </div>

          <div v-if="!charsVoiced && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            </div>
            <div class="empty-title">为角色设定性别</div>
            <div class="empty-desc">AI 根据角色特征自动判别性别（对白嗓音由 Seedance 生成，此处只定性别）</div>
            <button class="btn btn-primary" @click="doVoice">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI 自动判别
            </button>
          </div>
          <div v-else-if="rn && rt === 'voice_assigner'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent-dark)" />
            <div class="loading-text">正在判别性别...</div>
          </div>
          <div v-else class="voice-stage">
            <aside class="card voice-stage-panel">
              <div class="voice-stage-kicker">Character Gender</div>
              <div class="voice-stage-title">角色性别设定</div>
              <div class="voice-stage-desc">对白由 Seedance 原生人声 + 对口型生成，嗓音由模型决定。这里只需为每个角色定性别——它决定对白的性别表现；若角色有旁白 / 内心独白，则用对应性别的嗓音真实配音。真要挑具体旁白嗓音，可在「旁白配音」步处理。</div>
              <div class="voice-stage-stats">
                <div class="voice-stage-stat">
                  <span class="voice-stage-stat-label">已设性别</span>
                  <strong>{{ charsVoiced }}/{{ chars.length }}</strong>
                </div>
              </div>
            </aside>

            <div class="voice-grid">
              <div v-for="c in chars" :key="c.id" class="card voice-card">
                <div class="voice-card-head">
                  <div class="voice-char">
                    <div class="char-avatar lg">{{ c.name?.[0] || '?' }}</div>
                    <div class="voice-name">
                      <div class="voice-name-row">
                        <div class="extract-name">{{ c.name }}</div>
                        <span class="tag" :class="(c.voice_style || c.voiceStyle) ? 'tag-success' : ''">{{ (c.voice_style || c.voiceStyle) ? (getVoiceProfile(c.voice_style || c.voiceStyle)?.gender || '已选') : '待定' }}</span>
                      </div>
                      <div class="extract-meta">{{ c.role || '角色' }}</div>
                    </div>
                  </div>
                </div>

                <div class="voice-card-copy">
                  <div class="voice-card-text">{{ c.description || c.personality || c.appearance || '暂无角色描述，可根据人物定位设定性别。' }}</div>
                </div>

                <div class="voice-select-block">
                  <span class="voice-block-label">性别</span>
                  <span class="dim" style="font-size:11px;display:block;margin:-2px 0 6px">对白由 Seedance 按此性别生成；若该角色有旁白 / 内心独白，会用对应性别嗓音真实配音。</span>
                  <div class="gender-toggle">
                    <button type="button" class="gender-btn" :class="{ active: genderOf(c) === '男' }" @click="setCharGender(c, '男')">男</button>
                    <button type="button" class="gender-btn" :class="{ active: genderOf(c) === '女' }" @click="setCharGender(c, '女')">女</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 4: Storyboard -->
        <div v-else-if="scriptStep === 4" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">05</span>
                <span class="step-name">分镜列表</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="sbs.length" class="char-count">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
              <button v-if="sbs.length" class="btn btn-sm" @click="addShot">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加
              </button>
              <template v-if="!sbs.length">
                <span class="locked-config">视频模型 · {{ lockedVideoConfigLabel }}</span>
              </template>
              <button class="btn btn-sm" :disabled="rn" @click="doBreakdown">
                <Loader2 v-if="rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ sbs.length ? '重新拆解' : 'AI 拆解分镜' }}
              </button>
            </div>
          </div>

          <div v-if="sbs.length" class="split-layout">
            <!-- Shot List -->
            <div class="shot-list">
              <div class="shot-list-head">
                <div>
                  <div class="shot-list-title">镜头序列</div>
                  <div class="shot-list-sub">点任一镜头 → 右侧逐项编辑全部字段</div>
                </div>
                <span class="tag mono">{{ totalDuration }}s</span>
              </div>
              <div class="shot-list-body">
                <div
                  v-for="(sb, i) in sbs"
                  :key="sb.id"
                  :class="['shot-item', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb"
                >
                  <div class="shot-item-header">
                    <div class="shot-num">#{{ String(i+1).padStart(2,'0') }}</div>
                    <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    <span v-if="getStoryboardCharacterIds(sb).length" class="tag" style="font-size:10px">{{ getStoryboardCharacterIds(sb).length }} 角色</span>
                    <div class="shot-status">
                      <div v-if="sb.imageUrl || sb.composedImage || sb.firstFrameImage" class="shot-dot has-img" title="已生成图片"></div>
                      <div v-if="sb.videoUrl || sb.composedVideoUrl" class="shot-dot has-video" title="已生成视频"></div>
                      <div v-if="sb.dialogue" class="shot-dot has-dialogue" title="有对白"></div>
                    </div>
                  </div>
                  <div class="shot-body">
                    <div class="shot-desc">{{ sb.description || sb.title || '无描述' }}</div>
                  </div>
                  <div class="shot-meta">
                    <span class="mono dim" style="font-size:10px">{{ sb.duration || 10 }}s</span>
                    <span v-if="sb.location" class="shot-location">{{ sb.location }}</span>
                    <span v-if="getStoryboardCharacterNames(sb).length" class="shot-location">{{ getStoryboardCharacterNames(sb).join(' / ') }}</span>
                    <span v-if="sb.dialogue" class="shot-dialogue">{{ sb.dialogue }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Detail Panel -->
            <div class="detail-panel" v-if="selectedSb">
                <div class="detail-head">
                  <div class="detail-head-copy">
                    <span class="detail-head-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>编辑镜头 #{{ sbs.indexOf(selectedSb) + 1 }}</span>
                  <span class="detail-head-sub">{{ selectedSb.title || `镜头 ${sbs.indexOf(selectedSb) + 1}` }} · {{ selectedSb.shot_type || selectedSb.shotType || '未设置景别' }}</span>
                  </div>
                  <span class="tag mono">{{ (selectedSb.duration || 10) }}s</span>
                  <button class="btn btn-ghost btn-icon ml-auto" style="color:var(--error)" @click="deleteShot(selectedSb)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
              </div>
              <div class="detail-body">
                <div class="edit-hint">✏️ AI 已自动填好以下全部字段，均可逐项手动修改（景别 / 运镜 / 布光 / 对白 / 首尾帧提示词…）</div>
                <div class="detail-hero">
                  <div class="detail-hero-copy">
                    <div class="detail-hero-label">镜头概览</div>
                    <div class="detail-hero-text">{{ selectedSb.description || selectedSb.title || '当前镜头还没有画面描述，建议先补充核心动作和构图。' }}</div>
                    <div class="detail-status-row">
                      <span class="tag">{{ getSceneName(selectedSb) }}</span>
                      <span class="tag">{{ selectedSb.angle || '未设角度' }}</span>
                      <span class="tag">{{ selectedSb.movement || '未设运镜' }}</span>
                      <span class="tag" :class="getFirstFrame(selectedSb) ? 'tag-success' : ''">首帧 {{ getFirstFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="getLastFrame(selectedSb) ? 'tag-success' : ''">尾帧 {{ getLastFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                      <span class="tag" :class="hasVid(selectedSb) ? 'tag-success' : ''">视频 {{ hasVid(selectedSb) ? '已生成' : '待生成' }}</span>
                    </div>
                  </div>
                  <div class="detail-preview-grid">
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">首帧</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getFirstFrame(selectedSb)"
                          :src="'/' + getFirstFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(selectedSb), `镜头 #${sbs.indexOf(selectedSb) + 1} 首帧`)"
                        />
                        <div v-else class="detail-preview-empty">待生成</div>
                      </div>
                    </div>
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">尾帧</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getLastFrame(selectedSb)"
                          :src="'/' + getLastFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(selectedSb), `镜头 #${sbs.indexOf(selectedSb) + 1} 尾帧`)"
                        />
                        <div v-else class="detail-preview-empty">待生成</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">镜头结构</span>
                    <span class="detail-section-copy">景别、角度、运镜、场景绑定和时长</span>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">标题</span>
                      <input :value="selectedSb.title || ''" class="input"
                        @blur="updateField(selectedSb, 'title', $event.target.value)" placeholder="如：雪地逼近" />
                    </label>
                    <label class="field">
                      <span class="field-label">景别</span>
                      <input
                        list="shot-type-list"
                        :value="selectedSb.shot_type || selectedSb.shotType || ''"
                        class="input"
                        placeholder="选择或输入景别"
                        @change="updateField(selectedSb, 'shot_type', $event.target.value)"
                      />
                      <datalist id="shot-type-list">
                        <option v-for="t in shotTypes" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">角度</span>
                      <input
                        list="shot-angle-list"
                        :value="selectedSb.angle || ''"
                        class="input"
                        placeholder="选择或输入角度"
                        @change="updateField(selectedSb, 'angle', $event.target.value)"
                      />
                      <datalist id="shot-angle-list">
                        <option v-for="t in shotAngles" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">运镜</span>
                      <input
                        list="shot-movement-list"
                        :value="selectedSb.movement || ''"
                        class="input"
                        placeholder="选择或输入运镜"
                        @change="updateField(selectedSb, 'movement', $event.target.value)"
                      />
                      <datalist id="shot-movement-list">
                        <option v-for="t in shotMovements" :key="t" :value="t" />
                      </datalist>
                    </label>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">布光</span>
                      <input list="shot-lighting-list" :value="selectedSb.lighting || ''" class="input" placeholder="选择或输入布光"
                        @change="updateField(selectedSb, 'lighting', $event.target.value)" />
                      <datalist id="shot-lighting-list"><option v-for="t in shotLighting" :key="t" :value="t" /></datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">构图</span>
                      <input list="shot-composition-list" :value="selectedSb.composition || ''" class="input" placeholder="选择或输入构图"
                        @change="updateField(selectedSb, 'composition', $event.target.value)" />
                      <datalist id="shot-composition-list"><option v-for="t in shotCompositions" :key="t" :value="t" /></datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">情绪节拍</span>
                      <input list="shot-emotion-list" :value="selectedSb.emotion_beat || selectedSb.emotionBeat || ''" class="input" placeholder="选择或输入情绪"
                        @change="updateField(selectedSb, 'emotion_beat', $event.target.value)" />
                      <datalist id="shot-emotion-list"><option v-for="t in shotEmotions" :key="t" :value="t" /></datalist>
                    </label>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">绑定角色</span>
                      <div class="role-pills">
                        <button
                          v-for="char in chars"
                          :key="char.id"
                          type="button"
                          :class="['role-pill', { active: isStoryboardCharacterSelected(selectedSb, char.id) }]"
                          @click="toggleStoryboardCharacter(selectedSb, char.id)"
                        >
                          {{ char.name }}
                        </button>
                        <span v-if="!chars.length" class="dim" style="font-size:12px">当前集还没有角色</span>
                      </div>
                    </label>
                    <label class="field">
                      <span class="field-label">绑定场景</span>
                      <select class="input" :value="selectedSb.scene_id || selectedSb.sceneId || ''"
                        @change="updateField(selectedSb, 'scene_id', $event.target.value ? Number($event.target.value) : null)">
                        <option value="">未绑定场景</option>
                        <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
                          {{ scene.location }} · {{ scene.time || '未设时间' }}
                        </option>
                      </select>
                    </label>
                    <label class="field">
                      <span class="field-label">地点</span>
                      <input :value="selectedSb.location || ''" class="input"
                        @blur="updateField(selectedSb, 'location', $event.target.value)" placeholder="场景地点" />
                    </label>
                    <label class="field">
                      <span class="field-label">时间</span>
                      <input :value="selectedSb.time || ''" class="input"
                        @blur="updateField(selectedSb, 'time', $event.target.value)" placeholder="如：深夜 / 清晨" />
                    </label>
                    <label class="field">
                      <span class="field-label">时长</span>
                      <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60"
                        @blur="updateField(selectedSb, 'duration', Number($event.target.value))" />
                    </label>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">画面语义</span>
                    <span class="detail-section-copy">动作、结果、氛围和对白</span>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">动作</span>
                      <textarea :value="selectedSb.action || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'action', $event.target.value)" placeholder="谁在做什么，表情和动作细节是什么" />
                    </label>
                    <label class="field">
                      <span class="field-label">结果</span>
                      <textarea :value="selectedSb.result || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'result', $event.target.value)" placeholder="镜头结束时的状态变化或画面结果" />
                    </label>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">画面描述</span>
                      <textarea :value="selectedSb.description || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'description', $event.target.value)" placeholder="描述画面内容..." />
                    </label>
                    <label class="field">
                      <span class="field-label">氛围</span>
                      <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
                    </label>
                  </div>
                  <label class="field">
                    <span class="field-label">对白 / 旁白</span>
                    <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="3"
                      @blur="updateField(selectedSb, 'dialogue', $event.target.value)" placeholder="角色名：台词内容 或 旁白：内容" />
                  </label>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">生成提示</span>
                    <span class="detail-section-copy">分别服务图片、视频、配乐和音效生成</span>
                  </div>
                  <label class="field">
                    <span class="field-label">静态画面提示词</span>
                    <textarea :value="selectedSb.image_prompt || selectedSb.imagePrompt || ''" class="textarea" rows="4"
                      @blur="updateField(selectedSb, 'image_prompt', $event.target.value)" placeholder="用于首帧、尾帧和镜头图片的单帧画面提示词" />
                  </label>
                  <label class="field">
                    <span class="field-label">视频提示词</span>
                    <textarea :value="selectedSb.video_prompt || selectedSb.videoPrompt || ''" class="textarea" rows="5"
                      @blur="updateField(selectedSb, 'video_prompt', $event.target.value)" placeholder="按 3 秒分段的视频提示词..." />
                  </label>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">配乐提示词</span>
                      <textarea :value="selectedSb.bgm_prompt || selectedSb.bgmPrompt || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'bgm_prompt', $event.target.value)" placeholder="如：压抑低频弦乐，缓慢推进" />
                    </label>
                    <label class="field">
                      <span class="field-label">音效提示词</span>
                      <textarea :value="selectedSb.sound_effect || selectedSb.soundEffect || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'sound_effect', $event.target.value)" placeholder="如：风雪声、脚踩积雪、衣料摩擦声" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="rn && rt === 'storyboard_breaker'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent-dark)" />
            <div class="loading-text">正在拆解分镜并生成提示词…</div>
            <div class="loading-text" style="font-size:12px;opacity:0.7;margin-top:4px">约需 1–2 分钟,AI 正在逐个镜头生成,请耐心等待、不要关闭或刷新页面</div>
          </div>

          <div v-else class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
              </svg>
            </div>
            <div class="empty-title">将剧本拆解为分镜序列</div>
            <div class="empty-desc">AI 自动分析剧本，生成镜头列表和视频提示词</div>
            <div class="locked-config-banner">当前集视频模型：{{ lockedVideoConfigLabel }}</div>
            <button class="btn btn-primary" @click="doBreakdown">
              <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI 拆解分镜
            </button>
          </div>
        </div>

      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="panel === 'production'" class="content-panel">
        <!-- Guard: need script -->
        <div v-if="!scriptContent || !sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">{{ !scriptContent ? '请先完成剧本编写' : '请先完成分镜拆解' }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>

        <template v-else>
          <div class="step-toolbar prod-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span class="step-name">制作工作台</span>
              </div>
            </div>
            <div class="prod-tabs">
              <button
                v-for="t in prodTabDefs"
                :key="t.id"
                :class="['prod-tab', { active: prodTab === t.id }]"
                @click="prodTab = t.id"
              >
                <component :is="t.icon" :size="11" />
                {{ t.label }}
                <span v-if="t.beta" class="prod-tab-beta">测试</span>
                <span v-if="t.badge" class="prod-tab-badge">{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <!-- Sub: Characters -->
          <div v-if="prodTab === 'chars'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ visualChars.length }} 个需生成形象角色</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <span v-if="chars.length > visualChars.length" class="tag">旁白仅保留声音</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量生成
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="c in visualChars" :key="c.id" class="card asset-card">
                <div class="asset-cover">
                  <img
                    v-if="c.image_url || c.imageUrl"
                    :src="'/' + (c.image_url || c.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (c.image_url || c.imageUrl), `${c.name} 角色形象`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                  <div v-if="isPendingCharImage(c.id)" class="asset-cover-loading">
                    <div class="asset-loading-bar"><i></i></div>
                    <span class="asset-loading-text">AI 生成中…</span>
                  </div>
                </div>
                <div class="asset-body">
                  <div class="asset-name">{{ c.name }}</div>
                  <div class="asset-meta dim">{{ c.role || '角色' }}</div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (c.image_url || c.imageUrl) && 'ok', isPendingCharImage(c.id) && 'pending']" />
                  <span class="dim" style="font-size:10px">{{ (c.image_url || c.imageUrl) ? '已生成' : (isPendingCharImage(c.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-sm ml-auto" :disabled="isPendingCharImage(c.id)" @click="genCharImg(c.id)">
                    {{ isPendingCharImage(c.id) ? '生成中' : ((c.image_url || c.imageUrl) ? '重新生成' : '生成') }}
                  </button>
                  <input
                    :id="`char-upload-${c.id}`"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    style="display:none"
                    @change="uploadCharImage(c, $event)"
                  />
                  <button class="btn btn-sm" :disabled="isPendingCharUpload(c.id) || isPendingCharImage(c.id)" title="导入人物参考图，并生成当前项目画风的角色图" @click="openCharUpload(c.id)">
                    {{ isPendingCharUpload(c.id) ? '上传中' : '导入参考' }}
                  </button>
                  <button class="btn btn-sm" :disabled="isPendingCharImage(c.id)" title="自定义提示词重新生成" @click="openCharCustomDialog(c)">自定义</button>
                </div>

                <!-- 三视图：侧面 + 背面（角色一致性 boost） -->
                <div v-if="(c.image_url || c.imageUrl)" class="char-views">
                  <div class="char-view-row">
                    <span class="char-view-label">三视图</span>
                    <div class="char-view-slot" :title="c.view_side || c.viewSide ? '点击预览' : '点击生成侧面'" @click="(c.view_side || c.viewSide) ? openImageViewer('/' + (c.view_side || c.viewSide), `${c.name} 侧面`) : genCharView(c.id, 'side')">
                      <img v-if="c.view_side || c.viewSide" :src="'/' + (c.view_side || c.viewSide)" />
                      <Loader2 v-else-if="isPendingCharView(c.id, 'side')" :size="14" class="animate-spin" />
                      <div v-else class="char-view-empty">
                        <span class="char-view-glyph">侧</span>
                        <span class="char-view-plus">+</span>
                      </div>
                      <button v-if="(c.view_side || c.viewSide) && !isPendingCharView(c.id, 'side')" class="char-view-regen" title="重新生成" @click.stop="genCharView(c.id, 'side')">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      </button>
                    </div>
                    <div class="char-view-slot" :title="c.view_back || c.viewBack ? '点击预览' : '点击生成背面'" @click="(c.view_back || c.viewBack) ? openImageViewer('/' + (c.view_back || c.viewBack), `${c.name} 背面`) : genCharView(c.id, 'back')">
                      <img v-if="c.view_back || c.viewBack" :src="'/' + (c.view_back || c.viewBack)" />
                      <Loader2 v-else-if="isPendingCharView(c.id, 'back')" :size="14" class="animate-spin" />
                      <div v-else class="char-view-empty">
                        <span class="char-view-glyph">背</span>
                        <span class="char-view-plus">+</span>
                      </div>
                      <button v-if="(c.view_back || c.viewBack) && !isPendingCharView(c.id, 'back')" class="char-view-regen" title="重新生成" @click.stop="genCharView(c.id, 'back')">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Scenes -->
          <div v-else-if="prodTab === 'scenes'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ scenes.length }} 个场景</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量生成
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="s in scenes" :key="s.id" class="card asset-card">
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="'/' + (s.image_url || s.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (s.image_url || s.imageUrl), `${s.location} 场景图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (isPendingSceneImage(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? '已生成' : (isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name">{{ s.location }}</div>
                  <div class="asset-meta dim">{{ s.time || '—' }}</div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', isPendingSceneImage(s.id) && 'pending']" />
                  <span class="dim" style="font-size:10px">{{ (s.image_url || s.imageUrl) ? '已生成' : (isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                  <button class="btn btn-ghost btn-icon ml-auto" :disabled="isPendingSceneImage(s.id)" @click="openSceneCustomDialog(s)" title="自定义生成">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  </button>
                  <button class="btn btn-sm" :disabled="isPendingSceneImage(s.id)" @click="genSceneImg(s.id)">
                    {{ isPendingSceneImage(s.id) ? '生成中' : ((s.image_url || s.imageUrl) ? '重新生成' : '生成') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Dubbing -->
          <div v-else-if="prodTab === 'dubbing'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ ttsEligibleCount }} 条旁白待配音</span>
              <span class="tag mono">{{ ttsGeneratedCount }}/{{ ttsEligibleCount }} 已生成</span>
              <span class="tag">{{ lockedAudioConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchShotTTS">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                  批量生成
                </button>
              </div>
            </div>

            <div v-if="!ttsEligibleCount" class="step-empty" style="min-height:260px">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div class="empty-title">当前没有可生成的配音</div>
              <div class="empty-desc">先在分镜里填写“角色名：台词”或“旁白：文案”，这里就会出现待生成的语音镜头。</div>
            </div>

            <div v-else class="dub-grid">
                <div v-for="(sb, i) in sbs.filter(isNarrationShot)" :key="sb.id" class="card dub-card">
                  <div class="dub-head">
                    <div class="dub-copy">
                    <div class="dub-title">
                      <span class="frame-num">#{{ String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2, '0') }}</span>
                      <span class="frame-badge">{{ getDialogueSpeaker(sb) }}</span>
                    </div>
                    <div class="dub-desc">{{ getDialogueText(sb) || '未填写文本' }}</div>
                    </div>
                    <span class="tag" :class="hasTTS(sb) ? 'tag-success' : ''">{{ hasTTS(sb) ? '已生成' : '待生成' }}</span>
                  </div>
                <div class="dub-meta">
                  <span class="dim">{{ sb.shot_type || sb.shotType || '未设景别' }}</span>
                  <span class="dim">{{ sb.duration || 10 }}s</span>
                  <span class="dim">{{ sb.location || '未设地点' }}</span>
                </div>
                <div class="dub-voice">
                  <span class="dim" style="font-size:11px;white-space:nowrap">音色 · {{ narrationCharacter(sb)?.name || '旁白' }}</span>
                  <BaseSelect :model-value="shotVoice(sb)" :options="voiceSelectOptions" placeholder="选择音色" searchable style="flex:1;min-width:0" @update:model-value="pickDubVoice(sb, $event)" />
                </div>
                <div class="dub-foot">
                  <audio v-if="hasTTS(sb)" :key="getTTSUrl(sb)" :src="'/' + getTTSUrl(sb)" controls preload="none" class="dub-audio" />
                  <div v-else class="dim" style="font-size:12px">尚未生成语音文件</div>
                  <button class="btn btn-sm ml-auto" @click="genShotTTS(sb)">生成配音</button>
                </div>
                <div v-if="lastTts[sb.id]" class="dim" style="font-size:11px;margin-top:6px">实际用了：<b>{{ lastTts[sb.id].voice }}</b><span v-if="lastTts[sb.id].engine"> · 引擎:{{ lastTts[sb.id].engine }}</span><span v-if="!lastTts[sb.id].override" style="color:var(--error)"> · ⚠️ 覆盖未生效</span></div>
              </div>
            </div>
          </div>

          <!-- Sub: Shots -->
          <div v-else-if="prodTab === 'shots'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotImgCount }}/{{ sbs.length }} 已有帧图</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <BaseSelect v-model="frameMode" :options="frameModeOptions" placeholder="帧模式" searchable style="width:100px" />
                <button v-if="gridImagePath" class="btn btn-sm" @click="reopenGridPreview">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  查看当前宫格图
                </button>
                <button class="btn btn-primary btn-sm" @click="openGridTool">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  宫格图工具
                </button>
              </div>
            </div>

            <div v-if="gridHistory.length" class="grid-history-panel">
              <div v-if="gridImagePath" class="latest-grid-strip">
                <button class="latest-grid-strip-thumb" @click="openImageViewer('/' + gridImagePath, '当前宫格图')">
                  <img :src="'/' + gridImagePath" class="previewable-image" />
                </button>
                <div class="latest-grid-strip-copy">
                  <div class="latest-grid-strip-head">
                    <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }}</span>
                    <span class="tag" v-if="gridRecoveredMode">{{ gridRecoveredMode }}</span>
                  </div>
                  <div class="latest-grid-strip-title">当前宫格图</div>
                  <div class="latest-grid-strip-meta">
                    <span v-if="gridRecoveredAt">{{ gridRecoveredAt }}</span>
                    <span>可继续切割并分配</span>
                  </div>
                </div>
                <div class="latest-grid-strip-actions">
                  <button class="btn btn-sm" @click="reopenGridPreview">预览</button>
                  <button class="btn btn-primary btn-sm" @click="continueGridSplit">继续切割</button>
                </div>
              </div>
              <div class="grid-history-head">
                <div>
                  <div class="grid-history-title">历史宫格图</div>
                  <div class="grid-history-subtitle">按需展开切换不同宫格图，不默认占用第一屏</div>
                </div>
                <button class="btn btn-sm" @click="showAllGridHistory = !showAllGridHistory">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="showAllGridHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
                  {{ showAllGridHistory ? '收起历史宫格图' : `展开全部 (${gridHistory.length})` }}
                </button>
              </div>
              <div v-if="showAllGridHistory" class="grid-history-list">
                <button
                  v-for="item in gridHistory"
                  :key="item.id"
                  :class="['grid-history-item', { active: item.localPath === gridImagePath }]"
                  @click="selectGridHistory(item)"
                >
                  <div class="grid-history-thumb">
                    <img :src="'/' + item.localPath" class="previewable-image" />
                  </div>
                  <div class="grid-history-copy">
                    <div class="grid-history-tags">
                      <span class="tag mono">#{{ item.id }}</span>
                      <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
                      <span class="tag">{{ item.modeLabel }}</span>
                    </div>
                    <div class="grid-history-meta">{{ item.createdAtLabel }}</div>
                  </div>
                </button>
              </div>
            </div>

            <div class="frame-scroll">
              <div class="frame-grid">
                <div v-for="(sb, i) in sbs" :key="sb.id"
                  :class="['frame-row', 'card', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb">
                  <!-- Info: number + type + desc -->
                  <div class="frame-info">
                    <div class="frame-top">
                      <span class="frame-num">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="frame-badge">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    </div>
                    <div class="frame-desc">{{ sb.description || sb.title || '—' }}</div>
                    <div class="frame-meta">
                      <span :class="['dot', getFirstFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'first_frame') && 'pending']" />
                      <span class="dim" style="font-size:11px">首帧</span>
                      <span v-if="frameMode === 'first_last'" style="display:flex;align-items:center;gap:4px">
                        <span :class="['dot', getLastFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'last_frame') && 'pending']" />
                        <span class="dim" style="font-size:11px">尾帧</span>
                      </span>
                    </div>
                  </div>
                  <!-- Thumbnails -->
                  <div class="frame-thumbs">
                    <div class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'first_frame') && !getFirstFrame(sb) && genShotFrame(sb, 'first_frame')">
                        <img
                          v-if="getFirstFrame(sb)"
                          :src="'/' + getFirstFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 首帧`)"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'first_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                      </div>
                      <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'first_frame') ? '首帧生成中' : '首帧' }}</span>
                      <div v-if="getFirstFrame(sb) && !isPendingShotFrame(sb.id, 'first_frame')" class="frame-btns">
                        <button class="frame-btn frame-btn-icon" title="重新生成（同 prompt）" @click.stop="genShotFrame(sb, 'first_frame')">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                        <button class="frame-btn frame-btn-edit" title="自定义编辑提示词后重新生成" @click.stop="openShotCustomDialog(sb, 'first_frame')">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          自定义
                        </button>
                      </div>
                    </div>
                    <div v-if="frameMode === 'first_last'" class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'last_frame') && !getLastFrame(sb) && genShotFrame(sb, 'last_frame')">
                        <img
                          v-if="getLastFrame(sb)"
                          :src="'/' + getLastFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(sb), `镜头 #${String(i + 1).padStart(2, '0')} 尾帧`)"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'last_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                      </div>
                      <span class="frame-thumb-label">{{ isPendingShotFrame(sb.id, 'last_frame') ? '尾帧生成中' : '尾帧' }}</span>
                      <div v-if="getLastFrame(sb) && !isPendingShotFrame(sb.id, 'last_frame')" class="frame-btns">
                        <button class="frame-btn frame-btn-icon" title="重新生成（同 prompt）" @click.stop="genShotFrame(sb, 'last_frame')">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                        <button class="frame-btn frame-btn-edit" title="自定义编辑提示词后重新生成" @click.stop="openShotCustomDialog(sb, 'last_frame')">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          自定义
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Grid Tool Dialog -->
            <div v-if="gridDialog" class="overlay" @click.self="gridDialog = false">
              <div class="card grid-tool">
                <div class="grid-tool-head">
                  <span style="font-size:15px;font-weight:600;font-family:var(--font-display)">宫格图工具</span>
                  <button class="btn btn-ghost btn-icon ml-auto" @click="gridDialog = false">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <!-- Step 0: Config -->
                <div v-if="gridStep === 0" class="grid-tool-body">
                  <div class="grid-mode-tabs">
                    <button v-for="m in gridModes" :key="m.id"
                      :class="['grid-mode-tab', { active: gridMode === m.id }]"
                      @click="gridMode = m.id; gridSelected = []; gridSingleTarget = null; gridAssignmentsState = []">
                      <span style="font-weight:600">{{ m.label }}</span>
                      <span class="dim" style="font-size:11px">{{ m.desc }}</span>
                    </button>
                  </div>

                  <div class="grid-config">
                    <label class="field" style="flex:0 0 auto" v-if="gridMode !== 'multi_ref'">
                      <span class="field-label">宫格</span>
                      <BaseSelect v-model="gridLayout" :options="gridLayoutOptions" placeholder="宫格" style="width:90px" />
                    </label>
                    <div class="field" style="flex:1">
                      <span class="field-label">
                        {{ gridMode === 'multi_ref' ? '选择目标镜头' : '选择镜头' }}
                        <span class="dim" v-if="gridMode !== 'multi_ref'">(已选 {{ gridSelected.length }})</span>
                      </span>
                    </div>
                    <div style="align-self:flex-end" v-if="gridMode !== 'multi_ref'">
                      <button class="btn btn-sm" @click="gridSelectAll">{{ gridSelected.length === sbs.length ? '取消全选' : '全选' }}</button>
                    </div>
                  </div>

                  <div class="grid-pick-list">
                    <label v-for="(sb, i) in sbs" :key="sb.id"
                      :class="['grid-pick-item', { selected: gridMode === 'multi_ref' ? gridSingleTarget === sb.id : gridSelected.includes(sb.id) }]">
                      <input v-if="gridMode === 'multi_ref'" type="radio" :value="sb.id" v-model="gridSingleTarget" name="grid-target" />
                      <input v-else type="checkbox" :value="sb.id" v-model="gridSelected" />
                      <span class="mono" style="font-size:11px;width:28px">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || '—' }}</span>
                    </label>
                  </div>

                  <div class="grid-tool-foot">
                    <span v-if="gridCanStart" class="tag mono">{{ gridAutoLayout.rows }}x{{ gridAutoLayout.cols }} = {{ gridAutoLayout.rows * gridAutoLayout.cols }}格</span>
                    <span class="dim" style="font-size:11px">{{ gridPromptLoading ? gridPromptStatus : gridSummary }}</span>
                    <button class="btn btn-primary ml-auto" :disabled="!gridCanStart || gridPromptLoading" @click="generateGridPrompt">
                      <Loader2 v-if="gridPromptLoading" :size="12" class="animate-spin" />
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {{ gridPromptLoading ? '生成中' : '生成提示词' }}
                    </button>
                  </div>
                </div>

                <!-- Step 1: Prompt Preview -->
                <div v-else-if="gridStep === 1" class="grid-tool-body">
                  <div class="grid-prompt-summary">
                    <div class="grid-prompt-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      宫格图提示词
                      <span v-if="gridPromptSource" class="tag ml-8">{{ gridPromptSource === 'agent' ? 'AI生成' : '模板兜底' }}</span>
                    </div>
                    <div class="grid-prompt-text">{{ gridPromptText || '（等待生成）' }}</div>
                  </div>

                  <div class="grid-blank-preview" :style="gridBlankStyle">
                    <div v-for="(cell, i) in gridCellPrompts" :key="i" class="grid-blank-cell">
                      <div class="grid-blank-cell-index">#{{ cell.shot_number }} {{ {first_frame:'首帧',last_frame:'尾帧',reference:'参考'}[cell.frame_type] || '' }}</div>
                      <div class="grid-blank-cell-desc">{{ cell.prompt }}</div>
                    </div>
                    <div v-for="i in Math.max(0, (gridAutoLayout.rows * gridAutoLayout.cols) - gridCellPrompts.length)" :key="'empty-'+i" class="grid-blank-cell empty">
                      <div class="grid-blank-cell-index">空</div>
                      <div class="grid-blank-cell-desc">—</div>
                    </div>
                  </div>

                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 0">上一步</button>
                    <button class="btn ml-auto" @click="generateGridPrompt" :disabled="gridPromptLoading">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      重新生成
                    </button>
                    <button class="btn btn-primary" @click="startGridGen">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      生成宫格图
                    </button>
                  </div>
                </div>

                <!-- Step 2: Generating -->
                <div v-else-if="gridStep === 2" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:300px">
                  <Loader2 :size="28" class="animate-spin" style="color:var(--accent-dark)" />
                  <div class="loading-text" style="margin-top:12px">宫格图生成中...</div>
                  <div class="dim" style="font-size:11px;margin-top:6px">{{ gridStatusText }}</div>
                </div>

                <!-- Step 3: Preview -->
                <div v-else-if="gridStep === 3" class="grid-tool-body grid-tool-body-preview">
                  <div class="grid-preview-layout">
                    <div class="grid-preview-pane">
                      <div class="grid-preview-wrap">
                        <div class="grid-preview-stage">
                          <img
                            :src="'/' + gridImagePath"
                            class="grid-preview-img previewable-image"
                            @click.stop="openImageViewer('/' + gridImagePath, '宫格图预览')"
                          />
                          <div class="grid-overlay" :style="gridOverlayStyle">
                            <button
                              v-for="(a, i) in gridAssignments"
                              :key="i"
                              type="button"
                              :class="['grid-overlay-cell', activeGridCell === i && 'active']"
                              @click="focusGridCell(i)"
                            >
                              <span class="grid-cell-label">{{ gridCellLabel(a) }}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="grid-adjust-summary">
                        <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }} = {{ gridActualLayout.rows * gridActualLayout.cols }}格</span>
                        <span class="dim" style="font-size:12px">{{ gridAssignedCount }}/{{ gridAssignments.length }} 格已分配</span>
                        <span class="tag" v-if="gridAssignedCount < gridAssignments.length">未分配格子会被忽略，不会写回分镜</span>
                      </div>
                    </div>
                    <div class="grid-assignment-pane">
                      <div class="grid-assign-head">
                        <div class="grid-assign-title">格子分配</div>
                        <div class="grid-assign-subtitle">切分后由你自己决定每格对应哪个分镜</div>
                      </div>
                      <div v-if="gridAssignmentTotalPages > 1" class="grid-assign-pagination">
                        <button class="btn btn-sm" :disabled="gridAssignmentPage === 0" @click="gridAssignmentPage--">上一页</button>
                        <span class="dim">第 {{ gridAssignmentPage + 1 }}/{{ gridAssignmentTotalPages }} 页</span>
                        <span class="dim">{{ gridAssignmentPageStart + 1 }}-{{ gridAssignmentPageEnd }} / {{ gridAssignments.length }}</span>
                        <button class="btn btn-sm ml-auto" :disabled="gridAssignmentPage >= gridAssignmentTotalPages - 1" @click="gridAssignmentPage++">下一页</button>
                      </div>
                      <div class="grid-assign-columns">
                        <span>格</span>
                        <span>镜头</span>
                        <span>类型</span>
                        <span>当前绑定</span>
                      </div>
                      <div class="grid-assign-info">
                        <div v-for="item in pagedGridAssignments" :key="item.index" :class="['grid-assign-row', activeGridCell === item.index && 'active']">
                          <span class="grid-assign-index">格{{ item.index + 1 }}</span>
                          <BaseSelect
                            :model-value="item.assignment.storyboard_id"
                            :options="gridAssignmentShotOptions"
                            placeholder="选择镜头"
                            @update:model-value="updateGridAssignment(item.index, 'storyboard_id', $event)"
                          />
                          <BaseSelect
                            :model-value="item.assignment.frame_type"
                            :options="gridFrameTypeOptions"
                            placeholder="帧类型"
                            style="width:100%"
                            @update:model-value="updateGridAssignment(item.index, 'frame_type', $event)"
                          />
                          <span class="grid-assign-bind">{{ gridCellTitle(item.assignment.storyboard_id) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 1">返回</button>
                    <button class="btn btn-primary ml-auto" @click="doGridSplit">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      切分并分配
                    </button>
                  </div>
                </div>

                <!-- Step 4: Done -->
                <div v-else-if="gridStep === 4" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:200px">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <div style="font-size:17px;font-weight:700;font-family:var(--font-display);margin-top:8px">分配完成</div>
                  <div class="dim" style="font-size:13px;margin-top:4px">{{ gridAssignedCount }} 格已分配</div>
                  <button class="btn btn-primary" style="margin-top:16px" @click="gridDialog = false; refresh()">关闭</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Videos -->
          <div v-else-if="prodTab === 'videos'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotVidCount }}/{{ sbs.length }} 已生成</span>
              <div class="ml-auto flex gap-1" style="align-items:center;flex-wrap:wrap;row-gap:6px;justify-content:flex-end">
                <label class="dim" style="font-size:11px;margin-right:4px">引擎</label>
                <div class="engine-seg">
                  <button type="button" :class="['engine-opt', videoEngine==='happyhorse_full' && 'active']" @click="videoEngine='happyhorse_full'" title="阿里云百炼官方 HappyHorse 1.1：满血版，支持最长 15 秒、音视频生成和多参考图；区别于旧云雾 HappyHorse 下架入口">
                    HappyHorse 1.1<span class="engine-tag good">首选·满血官方</span>
                  </button>
                  <button type="button" :class="['engine-opt', videoEngine==='seedance' && 'active']" @click="videoEngine='seedance'" title="火山 Seedance 2.0：画质更好、无水印；较贵；同时最多 4 条，其余自动排队">
                    Seedance 2.0<span class="engine-tag good">贵·效果好</span>
                  </button>
                  <button type="button" :class="['engine-opt', videoEngine==='vidu' && 'active']" @click="videoEngine='vidu'" title="云雾 PixVerse：支持文生、图生、首尾帧和多参考；当前优先测试首尾帧">
                    PixVerse<span class="engine-tag good">首尾帧</span>
                  </button>
                  <button type="button" class="engine-opt disabled" disabled title="云雾 HappyHorse 已暂时下架，当前不可用">
                    HappyHorse 旧版<span class="engine-tag down">暂时下架</span>
                  </button>
                  <button type="button" :class="['engine-opt', videoEngine==='hailuo' && 'active']" @click="videoEngine='hailuo'" title="海螺 Hailuo（MiniMax）：写实真人可用，原片通常不带声音；需要到视频合成里混入配音">
                    海螺 Hailuo<span class="engine-tag good">静音·真人可用</span>
                  </button>
                </div>
                <label class="dim" style="font-size:11px;margin:0 4px 0 8px">画质</label>
                <select v-model="videoResolution" class="input" style="height:28px;font-size:12px;padding:0 8px" title="480P 仅 Seedance 原生支持；360P/540P 可用于 PixVerse 测试；720P 均衡，1080P 最清晰">
                  <option v-if="videoEngine === 'seedance'" value="480P">480P（最省·最快）</option>
                  <option v-if="videoEngine === 'vidu'" value="360P">360P（PixVerse 测试）</option>
                  <option v-if="videoEngine === 'vidu'" value="540P">540P（省积分）</option>
                  <option value="720P">720P（均衡）</option>
                  <option value="1080P">1080P（清晰）</option>
                </select>
                <span class="dim" style="font-size:11px;margin:0 4px" :title="`${videoEngineLabel} · ${videoResolution} ≈${videoRatePerSec} 积分/秒。例 5 秒 ≈${videoRatePerSec * 5} 积分`">≈{{ videoRatePerSec }} 积分/秒</span>
                <label class="video-ref-toggle" :title="videoUseLastFrame ? '开启：同时传入尾帧，结尾画面更可控，但可能更像首尾帧补间' : '关闭：只用首帧作起点，尾帧由提示词约束，剧情运动更自由'">
                  <input type="checkbox" :checked="videoUseLastFrame" @change="setVideoUseLastFrame($event.target.checked)" />
                  锁尾帧
                </label>
                <button class="btn btn-sm" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  批量视频
                </button>
                <button v-if="shotVidCount" class="btn btn-sm btn-download" :disabled="downloadingAll" @click="downloadAllVideos" title="把所有已生成的镜头原片打包成 zip 下载（最适合拿去剪映精剪）">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {{ downloadingAll ? '打包中…' : '一键下载全部' }}
                </button>
                <span v-if="pendingVideoIds.length || videoQueue.length" class="dim" style="font-size:11px;margin-left:6px" :title="videoEngine==='seedance' ? `Seedance 同时最多 ${videoConcurrency} 条，其余自动排队` : `每次最多并发 ${videoConcurrency} 条`">
                  生成中 {{ pendingVideoIds.length }}<template v-if="videoQueue.length"> · 排队 {{ videoQueue.length }}</template>
                </span>
                <span class="dim" style="font-size:11px;margin-left:6px" title="并发上限，超出自动排队">同时最多 {{ videoConcurrency }} 条</span>
              </div>
            </div>
            <div v-if="videoEngine === 'hailuo'" class="engine-note">
              海螺生成的是静音原片；需要声音时，请先生成配音，再到「视频合成」把配音和字幕合进去。
            </div>
            <div v-else-if="videoEngine === 'happyhorse_full'" class="engine-note">
              HappyHorse 1.1 满血版走阿里云百炼官方接口，支持 3-15 秒、音视频生成和最多 9 张参考图；旧 HappyHorse 是云雾下架入口，已暂停使用。
            </div>
            <div v-else-if="videoEngine === 'vidu'" class="engine-note">
              PixVerse 试运行：优先使用首尾帧 transition；有台词、音效或环境声的镜头会自动开启模型声音。建议先测 5-6 秒确认画面过渡。
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasVid(sb)"
                    :src="'/' + getPlayableVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="prod-dots">
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">图</span>
                    <span :class="['dot', hasVid(sb) && 'ok', (isPendingVideo(sb.id) || isQueuedVideo(sb.id)) && 'pending']" /><span style="font-size:10px">{{ isQueuedVideo(sb.id) ? '排队中' : (isPendingVideo(sb.id) ? '视频生成中' : '视频') }}</span>
                    <span v-if="hasVid(sb) && videoModelInfo(sb)" class="model-tag" :class="{ warn: videoModelInfo(sb).warn }" :title="videoModelInfo(sb).warn ? '这条没走 Seedance，用了兜底模型（带水印）' : '实际生成模型'">{{ videoModelInfo(sb).text }}</span>
                  </div>
                  <div v-if="videoFailMessage(sb.id)" class="prod-error">{{ videoFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button class="btn btn-sm btn-primary" @click="openVidBoard(sb)" title="打开镜头故事板：首尾帧 + 视频提示词，改完直接生成">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    故事板
                  </button>
                  <button class="btn btn-sm" :disabled="isPendingVideo(sb.id) || isQueuedVideo(sb.id)" @click="genVid(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ isQueuedVideo(sb.id) ? '排队中' : (isPendingVideo(sb.id) ? '生成中' : (hasVid(sb) ? '重新生成视频' : '生成视频')) }}
                  </button>
                  <a v-if="hasVid(sb)" class="btn btn-sm btn-download" :href="'/' + getVideoUrl(sb)" :download="videoDownloadName(sb, i)" title="下载这条镜头原片（无水印，适合剪映精剪）">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    下载
                  </a>
                </div>
              </div>
            </div>
            <div class="beta-note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span><b>专业短剧</b>建议下载视频后上传<b>剪映 / CapCut</b> 精剪；下面的「旁白配音 · 视频合成 · 一键剪辑」为<b>测试功能</b>，音画同步仍在优化。</span>
            </div>
          </div>

          <!-- Sub: Compose -->
          <div v-else-if="prodTab === 'compose'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ composedCount }}/{{ sbs.length }} 已合成</span>
              <label class="dim" style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;margin-left:10px" title="关掉后旁白镜头不混入配音（避免旁白比镜头长被截断），旁白交给剪辑器">
                <input type="checkbox" :checked="includeNarration" @change="setIncludeNarration($event.target.checked)" />
                合成加入旁白配音
              </label>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchCompose">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  批量合成
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasComposed(sb)"
                    :src="'/' + getComposedVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <video
                    v-else-if="hasVid(sb)"
                    :src="'/' + getVideoUrl(sb)"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">已合成</span>
                </div>
                <div class="prod-info">
                  <div class="prod-desc truncate">{{ sb.description || sb.title || '—' }}</div>
                  <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
                  <div class="prod-dots">
                    <span :class="['dot', hasVid(sb) && 'ok']" /><span style="font-size:10px">视频</span>
                    <span :class="['dot', hasTTS(sb) && 'ok']" /><span style="font-size:10px">配音</span>
                    <span :class="['dot', hasComposed(sb) && 'ok', isPendingCompose(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingCompose(sb.id) ? '合成中' : '合成' }}</span>
                  </div>
                  <div v-if="composeFailMessage(sb.id)" class="prod-error">{{ composeFailMessage(sb.id) }}</div>
                </div>
                <div class="prod-actions">
                  <button class="btn btn-sm" :disabled="!hasVid(sb) || isPendingCompose(sb.id)" @click="doCompose(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ isPendingCompose(sb.id) ? '合成中' : (hasComposed(sb) ? '重新合成' : '开始合成') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <div v-else class="content-panel">
        <div v-if="!sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">请先完成分镜和制作流程</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>
        <div v-else class="export-split">
          <div class="export-main">
            <template v-if="mergeUrl">
              <video :src="'/' + mergeUrl" controls class="export-video" />
              <div class="export-bar">
                <span class="tag tag-success">拼接完成</span>
                <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
                <button class="btn btn-ghost ml-auto" @click="doMerge" title="重新合成镜头后，点这里用最新镜头重新拼成整集（否则这里还是旧成片）">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  重新拼接
                </button>
                <a :href="'/' + mergeUrl" download class="btn btn-primary">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载视频
                </a>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;width:100%;max-width:720px">
                <span class="dim" style="font-size:12px">想精修（重排 / 裁剪 / 转场 / 配乐）？导出素材包到剪辑器自己剪：</span>
                <button class="btn btn-ghost btn-sm" :disabled="packaging" @click="exportPackage">
                  {{ packaging ? '打包中…' : '导出素材包' }}
                </button>
                <button class="btn btn-ghost btn-sm" @click="openOpenreel" title="浏览器剪辑器，导入刚导出的素材包即可剪辑">
                  用 OpenReel 剪辑 ↗
                </button>
                <span class="dim" style="font-size:11px">可导入 OpenReel / 剪映 / CapCut</span>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">一键剪辑成片</div>
                <div class="empty-desc">将 {{ composedCount }} 个已合成镜头一键拼成整片（测试功能，音画同步仍在优化；专业短剧建议用剪映精剪）</div>
                <button class="btn btn-primary" :disabled="composedCount === 0" @click="doMerge" style="margin-top:12px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  一键剪辑成片
                </button>
              </div>
            </template>
          </div>
          <div class="export-list">
            <div class="export-list-head">镜头概览</div>
            <div class="export-list-body">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="exp-row">
                <span class="mono dim" style="font-size:10px">#{{ String(i+1).padStart(2,'0') }}</span>
                <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                <span :class="['dot', hasComposed(sb) && 'ok']" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showBottomBubble" class="step-bubble">
        <button
          v-if="panel === 'script'"
          class="bubble-btn"
          :disabled="scriptStep === 0"
          @click="goPrevStep"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prevStepLabel || '上一步' }}
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn"
          :disabled="prodTabIdx === 0"
          @click="prodTabIdx = Math.max(0, prodTabIdx - 1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prodTabDefs[Math.max(0, prodTabIdx - 1)]?.label || '上一步' }}
        </button>

        <div class="bubble-dots">
          <button
            v-for="step in bubbleSteps"
            :key="step.key"
            :class="['bubble-dot', { done: step.done, current: step.key === activeBubbleKey }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="panel === 'script'"
          class="bubble-btn primary"
          :disabled="!canGoNext"
          @click="goNextStep"
        >
          {{ nextStepLabel || '下一步' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn primary"
          :disabled="panel === 'production' && prodTab === 'compose' && !canExport"
          @click="goNextProd"
        >
          {{ prodTabIdx < prodTabDefs.length - 1 ? (prodTabDefs[prodTabIdx + 1]?.label || '下一步') : '进入导出' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
        <div class="card image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="imageViewer.src" :alt="imageViewer.title || '图片预览'" class="image-viewer-img" />
          </div>
        </div>
      </div>

      <div v-if="extractConfirm.open" class="overlay extract-confirm-overlay" @click.self="closeExtractConfirm">
        <div class="card extract-confirm-dialog">
          <div class="extract-confirm-head">
            <div>
              <div class="extract-confirm-title">确认本集角色匹配</div>
              <div class="extract-confirm-sub">确认后才会保存角色和场景；已有定妆角色会继续沿用，不会重新生成。</div>
            </div>
            <button class="btn btn-ghost btn-icon" :disabled="extractConfirm.saving" @click="closeExtractConfirm">×</button>
          </div>
          <div class="extract-confirm-body">
            <div class="extract-section-title">角色</div>
            <div class="extract-map-list">
              <div v-for="(item, idx) in extractConfirm.characters" :key="idx" class="extract-map-row">
                <div class="extract-char-info">
                  <div class="extract-char-name">{{ item.name || '未命名角色' }}</div>
                  <div class="extract-char-desc">{{ item.role || item.description || item.match_reason || '本集识别角色' }}</div>
                </div>
                <select v-model="item.selection" class="extract-select">
                  <option value="create">新增角色</option>
                  <option value="ignore">忽略</option>
                  <option
                    v-for="pc in extractConfirm.projectCharacters"
                    :key="pc.id"
                    :value="`reuse:${pc.id}`"
                  >
                    复用：{{ pc.name }}{{ pc.has_visual ? '（已定妆）' : '' }}
                  </option>
                </select>
              </div>
            </div>
            <div class="extract-section-title">场景</div>
            <div class="extract-scene-summary">
              <span>识别到 {{ extractConfirm.scenes.length }} 个场景</span>
              <span>同地点同时间会自动复用，其余新增</span>
            </div>
          </div>
          <div class="extract-confirm-foot">
            <button class="btn" :disabled="extractConfirm.saving" @click="closeExtractConfirm">取消</button>
            <button class="btn btn-primary" :disabled="extractConfirm.saving" @click="confirmExtraction">
              <Loader2 v-if="extractConfirm.saving" :size="13" class="animate-spin" />
              确认保存
            </button>
          </div>
        </div>
      </div>
    </main>
    </div>

    <!-- Custom image generation dialog (used by scene/storyboard image triggers) -->
    <ImageGenerateDialog
      :open="customGenDialog.open"
      :title="customGenDialog.title"
      :subtitle="customGenDialog.subtitle"
      :default-prompt="customGenDialog.defaultPrompt"
      :characters="chars"
      :default-char-ids="customGenDialog.defaultCharIds"
      :on-enhance="customGenDialog.onEnhance"
      @close="closeCustomGen"
      @submit="handleCustomGenSubmit"
    />

    <!-- 镜头视频故事板弹窗：首尾帧 + 视频提示词 + 生成 -->
    <Teleport to="body">
      <div v-if="vidBoard.open && vidBoardSb" class="vboard-overlay" @click.self="vidBoard.open = false">
        <div class="vboard-card">
          <div class="vboard-head">
            <div class="vboard-title">镜头 #{{ sbs.indexOf(vidBoardSb) + 1 }} · 视频故事板<span v-if="hasVid(vidBoardSb) && videoModelInfo(vidBoardSb)" class="model-tag" :class="{ warn: videoModelInfo(vidBoardSb).warn }" style="margin-left:8px">{{ videoModelInfo(vidBoardSb).text }}</span></div>
            <button class="btn btn-ghost btn-icon" @click="vidBoard.open = false" title="关闭">×</button>
          </div>
          <div class="vboard-hint">
            <template v-if="videoUseLastFrame">当前会同时传入<b>首帧</b>和<b>尾帧</b>，结尾更可控，但如果两帧差距大，模型可能更像在做首尾帧补间。</template>
            <template v-else>当前只把<b>首帧</b>作为起始参考，尾帧不强锁，视频会更多按提示词里的剧情动作和镜头调度推进。</template>
          </div>
          <div class="vboard-frames">
            <div class="vboard-frame">
              <div class="vboard-frame-label">首帧</div>
              <div class="vboard-frame-media">
                <img v-if="getFirstFrame(vidBoardSb)" :src="'/' + getFirstFrame(vidBoardSb)" class="previewable-image" @click="openImageViewer('/' + getFirstFrame(vidBoardSb), '首帧')" />
                <div v-else class="vboard-frame-empty">未生成</div>
              </div>
              <button class="btn btn-sm" style="width:100%" :disabled="isPendingShotFrame(vidBoardSb.id, 'first_frame')" @click="genShotFrame(vidBoardSb, 'first_frame')">{{ isPendingShotFrame(vidBoardSb.id, 'first_frame') ? '生成中…' : (getFirstFrame(vidBoardSb) ? '重抽首帧' : '生成首帧') }}</button>
            </div>
            <div class="vboard-frame">
              <div class="vboard-frame-label">尾帧</div>
              <div class="vboard-frame-media">
                <img v-if="getLastFrame(vidBoardSb)" :src="'/' + getLastFrame(vidBoardSb)" class="previewable-image" @click="openImageViewer('/' + getLastFrame(vidBoardSb), '尾帧')" />
                <div v-else class="vboard-frame-empty">未生成</div>
              </div>
              <button class="btn btn-sm" style="width:100%" :disabled="isPendingShotFrame(vidBoardSb.id, 'last_frame')" @click="genShotFrame(vidBoardSb, 'last_frame')">{{ isPendingShotFrame(vidBoardSb.id, 'last_frame') ? '生成中…' : (getLastFrame(vidBoardSb) ? '重抽尾帧' : '生成尾帧') }}</button>
            </div>
          </div>
          <div class="vboard-field">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="voice-block-label">视频提示词</span>
              <button type="button" class="btn btn-sm btn-primary" :disabled="vidEnhancing" style="margin-left:auto" @click="enhanceVidPrompt(vidBoardSb)" title="用 storyboard_breaker skill 优化成电影级、带角色锚点">{{ vidEnhancing ? '✨ 优化中…' : '✨ AI 优化' }}</button>
            </div>
            <textarea :value="vidBoardSb.video_prompt || vidBoardSb.videoPrompt || ''" class="textarea" rows="5" placeholder="按 3 秒分段；写清运镜与动作变化（如：0-3秒 缓慢推近…）" @blur="updateField(vidBoardSb, 'video_prompt', $event.target.value)" />
          </div>
          <div class="vboard-foot">
            <button class="btn" @click="vidBoard.open = false">关闭</button>
            <label class="video-ref-toggle board-toggle" :title="videoUseLastFrame ? '开启：同时传入尾帧，结尾画面更可控' : '关闭：不传尾帧，剧情运动更自由'">
              <input type="checkbox" :checked="videoUseLastFrame" @change="setVideoUseLastFrame($event.target.checked)" />
              锁尾帧
            </label>
            <button class="btn btn-primary ml-auto" :disabled="isPendingVideo(vidBoardSb.id) || isQueuedVideo(vidBoardSb.id)" @click="genVid(vidBoardSb)">
              {{ isPendingVideo(vidBoardSb.id) ? '生成中…' : (hasVid(vidBoardSb) ? '重新生成视频' : '生成视频') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import JSZip from 'jszip'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, FileText, FolderKanban, Clapperboard, Download,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, composeAPI, mergeAPI, gridAPI, aiConfigAPI, voicesAPI, creditsAPI, agentExtractionAPI, humanizeError } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import BaseSelect from '~/components/BaseSelect.vue'
import ImageGenerateDialog from '~/components/ImageGenerateDialog.vue'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), sbs = ref([]), mergeData = ref(null)
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()
const { isAdmin } = useAuth()  // TTS 模型切换等运营操作仅管理员可见
const extractConfirm = reactive({
  open: false,
  loading: false,
  saving: false,
  characters: [],
  scenes: [],
  projectCharacters: [],
})

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const composedCount = computed(() => sbs.value.filter(s => s.composed_video_url || s.composedVideoUrl).length)
const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

const scriptStep = ref(0)
const hasAutoPlacedInitialStep = ref(false)
const prodTab = ref('chars')
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'chars' },
})
const frameMode = ref('first')
// 兜底音色表：仅当 /ai-voices 返回空时才用（正常情况下从后端 ai_voices 取 MiniMax 全量）。
// id 即 MiniMax 官方 voice_id，直接写回角色 voice_style。
const fallbackVoiceProfiles = [
  // —— 男声 ——
  { id: 'Chinese (Mandarin)_Gentleman', label: '温润男声', gender: '男声', traits: '温润磁性的青年男性', suitable: '男主、暖男' },
  { id: 'Chinese (Mandarin)_Reliable_Executive', label: '沉稳高管', gender: '男声', traits: '沉稳可靠的中年男性', suitable: '霸总、成熟男性' },
  { id: 'Chinese (Mandarin)_Gentle_Youth', label: '温润青年', gender: '男声', traits: '温柔的青年男性', suitable: '暖男配角' },
  { id: 'Chinese (Mandarin)_Unrestrained_Young_Man', label: '不羁青年', gender: '男声', traits: '潇洒不羁的青年男性', suitable: '痞帅、反派' },
  { id: 'Chinese (Mandarin)_Sincere_Adult', label: '真诚青年', gender: '男声', traits: '真诚有鼓励性的青年男性', suitable: '正派' },
  { id: 'Chinese (Mandarin)_Lyrical_Voice', label: '抒情男声', gender: '男声', traits: '磁性抒情的青年男性', suitable: '深情、内心戏' },
  { id: 'Chinese (Mandarin)_Radio_Host', label: '电台男主播', gender: '男声', traits: '富有诗意的青年男主播', suitable: '旁白、解说' },
  { id: 'Chinese (Mandarin)_Straightforward_Boy', label: '率真弟弟', gender: '男声', traits: '认真率真的少年', suitable: '活力男配' },
  { id: 'Chinese (Mandarin)_Pure-hearted_Boy', label: '清澈邻家弟弟', gender: '男声', traits: '清澈的邻家少年', suitable: '学生角色' },
  { id: 'Chinese (Mandarin)_Stubborn_Friend', label: '嘴硬竹马', gender: '男声', traits: '嘴硬心软不羁的青年竹马', suitable: '竹马' },
  { id: 'Chinese (Mandarin)_Southern_Young_Man', label: '南方小哥', gender: '男声', traits: '质朴的青年男性', suitable: '市井角色' },
  { id: 'Chinese (Mandarin)_Male_Announcer', label: '播报男声', gender: '男声', traits: '磁性权威的中年播报员', suitable: '旁白' },
  { id: 'Chinese (Mandarin)_Humorous_Elder', label: '搞笑大爷', gender: '男声', traits: '爽朗幽默的老年男性', suitable: '长者、喜剧' },
  { id: 'Chinese (Mandarin)_Cute_Spirit', label: '憨憨萌兽', gender: '男声', traits: '呆萌可爱的少年男声', suitable: '萌系、喜剧' },
  // —— 女声 ——
  { id: 'Chinese (Mandarin)_Warm_Girl', label: '温暖少女', gender: '女声', traits: '温柔温暖的少女', suitable: '女主' },
  { id: 'Chinese (Mandarin)_Sweet_Lady', label: '甜美女声', gender: '女声', traits: '温柔甜美的青年女性', suitable: '甜美女主' },
  { id: 'Chinese (Mandarin)_Mature_Woman', label: '傲娇御姐', gender: '女声', traits: '妩媚成熟的御姐', suitable: '女上司、强势女' },
  { id: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐', gender: '女声', traits: '温暖温柔的青年学姐', suitable: '温婉角色' },
  { id: 'Chinese (Mandarin)_Crisp_Girl', label: '清脆少女', gender: '女声', traits: '温暖清脆的少女', suitable: '青春女配' },
  { id: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜', gender: '女声', traits: '温暖清脆的青年女性', suitable: '闺蜜、好友' },
  { id: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐', gender: '女声', traits: '富有阅历抒情的中年姐姐', suitable: '知性女性' },
  { id: 'Chinese (Mandarin)_Soft_Girl', label: '软软女孩', gender: '女声', traits: '温暖柔软的青年女性', suitable: '软妹' },
  { id: 'Chinese (Mandarin)_News_Anchor', label: '新闻女声', gender: '女声', traits: '专业播音腔的中年女主播', suitable: '职场、旁白' },
  { id: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶', gender: '女声', traits: '温和善良的中年大婶', suitable: '市井女性' },
  { id: 'Chinese (Mandarin)_Kind-hearted_Elder', label: '花甲奶奶', gender: '女声', traits: '慈祥和蔼的老年女性', suitable: '奶奶、长辈' },
]
const voiceProfiles = ref(fallbackVoiceProfiles)
const videoConfigSelectOptions = computed(() => videoConfigs.value.map(c => {
  let modelName = ''
  try { const m = JSON.parse(c.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = c.model || '' }
  const label = modelName ? `${modelName} (${c.provider})` : `${c.name} (${c.provider})`
  return { label, value: c.id }
}))

// TTS quick-switch — 全量走 MiniMax 官方语音，这里切换的是 MiniMax 模型档（影响清晰度/成本）。
// 切换时把 minimax 音频配置设为最高优先级并更新其模型。
const TTS_MODEL_PRESETS = [
  { value: 'speech-2.8-hd', provider: 'minimax', label: 'MiniMax 2.8 HD（最自然，推荐）' },
  { value: 'speech-2.8-turbo', provider: 'minimax', label: 'MiniMax 2.8 Turbo（快/省）' },
  { value: 'speech-2.6-hd', provider: 'minimax', label: 'MiniMax 2.6 HD' },
]

// Video model quick-switch — overrides the active config's model per-generation.
// 视频引擎：happyhorse_full（阿里百炼 HappyHorse 1.1 满血版·首选默认）/ seedance（火山·贵·效果好·无水印·并发限 4）/ vidu（云雾 PixVerse）/ hailuo（海螺·真人可用）。
function normalizeVideoEngine(value) {
  if (value === 'vidu' || value === 'hailuo' || value === 'seedance' || value === 'happyhorse_full') return value
  if (value === 'happyhorse') return 'vidu'
  return 'happyhorse_full'
}
const videoEngine = ref(typeof window !== 'undefined' ? normalizeVideoEngine(localStorage.getItem('claw_video_engine') || 'happyhorse_full') : 'happyhorse_full')
const videoResolution = ref(typeof window !== 'undefined' ? (localStorage.getItem('claw_video_res') || '720P') : '720P')
const videoUseLastFrame = ref(typeof window !== 'undefined' ? localStorage.getItem('claw_video_use_last_frame') === '1' : false)
function normalizeVideoResolutionForEngine(engine, resolution) {
  if (engine !== 'seedance' && resolution === '480P') return engine === 'vidu' ? '360P' : '720P'
  if (engine !== 'vidu' && resolution === '540P') return '720P'
  if (engine !== 'vidu' && resolution === '360P') return '720P'
  return resolution
}
videoResolution.value = normalizeVideoResolutionForEngine(videoEngine.value, videoResolution.value)
watch(videoEngine, (v) => {
  if (typeof window !== 'undefined') localStorage.setItem('claw_video_engine', v)
  videoResolution.value = normalizeVideoResolutionForEngine(v, videoResolution.value)
})
watch(videoResolution, (v) => { if (typeof window !== 'undefined') localStorage.setItem('claw_video_res', v) })
function setVideoUseLastFrame(v) {
  videoUseLastFrame.value = !!v
  try { localStorage.setItem('claw_video_use_last_frame', v ? '1' : '0') } catch {}
}

const frameModeOptions = [{ label: '仅首帧', value: 'first' }, { label: '首尾帧', value: 'first_last' }]
const gridLayoutOptions = [
  { label: '2x2', value: '2x2' },
  { label: '3x3', value: '3x3' },
  { label: '4x4', value: '4x4' },
  { label: '5x5', value: '5x5' },
]
const imageConfigs = ref([])
const videoConfigs = ref([])
const audioConfigs = ref([])
const pendingCharImageIds = ref([])
const pendingCharUploadIds = ref([])
const pendingCharViewKeys = ref([])  // "characterId:view" pairs (view = 'side'|'back')
const pendingSceneImageIds = ref([])
const pendingShotFrameKeys = ref([])
const pendingVideoIds = ref([])
// 批量视频限并发：Seedance 并发上限约 4（与后端并发闸一致），PixVerse/海螺保守一点。
// 后端并发闸是跨标签页/用户的最终防线；前端这层是单标签页的节流 + 排队展示。
const videoConcurrency = computed(() => videoEngine.value === 'vidu' ? 3 : videoEngine.value === 'hailuo' ? 3 : videoEngine.value === 'happyhorse_full' ? 3 : 4)
const videoQueue = ref([]) // 等待中的 storyboard id（排队中，尚未发起）
const pendingComposeIds = ref([])
const failedVideoMessages = ref({})
const failedComposeMessages = ref({})
const imageViewer = ref({ open: false, src: '', title: '' })

function configLabel(config) {
  if (!config) return '未配置'
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function isPendingCharImage(id) {
  return pendingCharImageIds.value.includes(id)
}

function isPendingCharUpload(id) {
  return pendingCharUploadIds.value.includes(id)
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function handleImageViewerKeydown(event) {
  if (event.key === 'Escape' && imageViewer.value.open) closeImageViewer()
}

const pricing = ref({ image: 500, tts: 75, videoPerSec: { seedance: { '480p': 1250, '720p': 2500, '1080p': 5000 }, vidu: { '360p': 600, '540p': 1000, '720p': 1500, '1080p': 2000 }, happyhorse: { '720p': 2400, '1080p': 4800 }, happyhorse_full: { '720p': 2200, '1080p': 3000 }, hailuo: { '720p': 2500, '1080p': 5000 } } })
// 视频每秒积分（按引擎×画质动态计费）。兼容后端新结构(按引擎嵌套)与旧结构(扁平)。
const videoRatePerSec = computed(() => {
  const rs = String(videoResolution.value).toLowerCase()
  const k = rs.includes('1080') ? '1080p' : rs.includes('540') ? '540p' : rs.includes('480') ? '480p' : rs.includes('360') ? '360p' : '720p'
  const vps = pricing.value.videoPerSec || {}
  const table = vps[videoEngine.value] || vps
  return table[k] ?? table['720p'] ?? 2500
})
const videoEngineLabel = computed(() => videoEngine.value === 'seedance' ? 'Seedance' : videoEngine.value === 'vidu' ? 'PixVerse' : videoEngine.value === 'happyhorse_full' ? 'HappyHorse 1.1' : videoEngine.value === 'hailuo' ? '海螺 Hailuo' : 'HappyHorse')
onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
  creditsAPI.pricing().then(p => { if (p) pricing.value = p }).catch(() => {})
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
})

function isPendingSceneImage(id) {
  return pendingSceneImageIds.value.includes(id)
}

function framePendingKey(id, frameType) {
  return `${id}:${frameType}`
}

function isPendingShotFrame(id, frameType) {
  return pendingShotFrameKeys.value.includes(framePendingKey(id, frameType))
}

function isPendingVideo(id) {
  return pendingVideoIds.value.includes(id)
}

function isQueuedVideo(id) {
  return videoQueue.value.includes(id)
}

function videoFailMessage(id) {
  const raw = failedVideoMessages.value[id]
  return raw ? humanizeError(raw) : ''
}

function isPendingCompose(id) {
  return pendingComposeIds.value.includes(id)
}

function composeFailMessage(id) {
  const raw = failedComposeMessages.value[id]
  return raw ? humanizeError(raw) : ''
}

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const visualChars = computed(() => chars.value.filter(c => !isNarratorCharacter(c)))

const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedAudioConfigId = computed(() => episode.value?.audio_config_id || episode.value?.audioConfigId || null)
const lockedAudioProvider = computed(() => audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)?.provider || '')
const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(c => c.id === lockedImageConfigId.value)))
const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)))
const lockedAudioConfigLabel = computed(() => configLabel(audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)))

// Active audio config — mirrors backend getAudioConfig(): episode binding wins,
// otherwise the highest-priority active audio config (NOT just the first in list).
const activeAudioConfig = computed(() => {
  if (lockedAudioConfigId.value) {
    const bound = audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)
    if (bound) return bound
  }
  const active = audioConfigs.value
    .filter(c => (c.is_active ?? c.isActive ?? true))
    .slice()
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
  return active[0] || audioConfigs.value[0] || null
})
const currentTTSModel = computed(() => {
  const c = activeAudioConfig.value
  if (!c) return ''
  try {
    const m = typeof c.model === 'string' ? JSON.parse(c.model || '[]') : c.model
    return Array.isArray(m) ? (m[0] || '') : (m || '')
  } catch { return c.model || '' }
})
async function changeTTSModel(newModel) {
  const preset = TTS_MODEL_PRESETS.find(p => p.value === newModel)
  if (!preset) { toast.error('未知的 TTS 模型'); return }
  // Find the audio config for this preset's provider (gemini / openai)
  const target = audioConfigs.value.find(c => (c.provider || '').toLowerCase() === preset.provider)
  if (!target) { toast.error(`未找到 ${preset.provider} 音频配置，请先在设置中添加`); return }
  const alreadyActive = activeAudioConfig.value?.id === target.id
  if (alreadyActive && currentTTSModel.value === newModel) return
  try {
    const payload = { model: [newModel], is_active: true }
    // Switching provider: bump this config above all others so it becomes the default.
    if (!alreadyActive) {
      const maxPriority = Math.max(0, ...audioConfigs.value.map(c => Number(c.priority) || 0))
      payload.priority = maxPriority + 1
    }
    await aiConfigAPI.update(target.id, payload)
    toast.success(`已切换 TTS：${preset.label}`)
    await loadConfigs()
  } catch (e) {
    toast.error(e.message)
  }
}

// Grid tool state
const gridDialog = ref(false)
const gridStep = ref(0)
const gridLayout = ref('3x3')
const gridMode = ref('first_frame')
const gridSelected = ref([])
const gridSingleTarget = ref(null)
const gridGenId = ref(null)
const gridImagePath = ref('')
const gridStatusText = ref('')
const gridActualLayout = ref({ rows: 3, cols: 3 })
const gridRecoveredAt = ref('')
const gridRecoveredMode = ref('')
const gridPromptText = ref('')
const gridCellPrompts = ref([])
const gridPromptSource = ref('')
const gridPromptLoading = ref(false)
const gridPromptStatus = ref('')
const gridAssignmentsState = ref([])
const gridActiveShotIds = ref([])
const gridHistory = ref([])
const showAllGridHistory = ref(false)
const activeGridCell = ref(0)
const gridAssignmentPage = ref(0)
const gridStorageKey = computed(() => `huobao:grid:${dramaId}:${epId.value || episodeNumber}`)

const gridModes = [
  { id: 'first_frame', label: '首帧', desc: '每格=一个镜头的首帧' },
  { id: 'first_last', label: '首尾帧', desc: '每镜头占一行：左首帧，右尾帧' },
  { id: 'multi_ref', label: '多参考', desc: '所有格子=同一镜头的参考图' },
]

const gridLayoutShape = computed(() => {
  const [rows, cols] = String(gridLayout.value || '3x3').split('x').map(Number)
  return {
    rows: rows || 3,
    cols: cols || 3,
  }
})
const gridTotalCells = computed(() => {
  return gridLayoutShape.value.rows * gridLayoutShape.value.cols
})

const gridCanStart = computed(() => {
  if (gridMode.value === 'multi_ref') return !!gridSingleTarget.value
  return gridSelected.value.length > 0
})

const gridSummary = computed(() => {
  if (gridMode.value === 'multi_ref') {
    const idx = sbs.value.findIndex(s => s.id === gridSingleTarget.value) + 1
    return gridSingleTarget.value ? `${gridLayoutShape.value.rows}x${gridLayoutShape.value.cols} 参考图 → 镜头 #${idx}` : '请选择一个镜头'
  }
  if (!gridSelected.value.length) return '请选择镜头'
  const count = gridSelected.value.length
  if (gridMode.value === 'first_last') {
    const { rows, cols } = gridLayoutShape.value
    return `${count} 个镜头 → ${rows}x${cols} 宫格（按首尾帧风格生成，切分后再手动分配）`
  }
  const { rows, cols } = gridLayoutShape.value
  const cells = rows * cols
  return `${count} 个镜头 → ${rows}x${cols} 宫格（先生成宫格图，切分后再手动分配）`
})

function createGridAssignments() {
  return Array.from({ length: gridActualLayout.value.rows * gridActualLayout.value.cols }, () => ({
    storyboard_id: null,
    frame_type: 'first_frame',
  }))
}

const gridAssignments = computed(() => gridAssignmentsState.value)
const gridAssignableShotIds = computed(() => {
  const assignedIds = [...new Set(gridAssignments.value.map(item => item?.storyboard_id).filter(Boolean))]
  const ids = Array.isArray(gridActiveShotIds.value) && gridActiveShotIds.value.length
    ? gridActiveShotIds.value
    : assignedIds.length
      ? assignedIds
    : gridMode.value === 'multi_ref'
      ? (gridSingleTarget.value ? [gridSingleTarget.value] : [])
      : gridSelected.value.length
        ? [...gridSelected.value]
        : sbs.value.map(s => s.id)
  return ids.filter(id => sbs.value.some(s => s.id === id))
})
const gridAssignmentShotOptions = computed(() => [
  { label: '未分配', value: null },
  ...gridAssignableShotIds.value.map((id) => {
    const index = sbs.value.findIndex(s => s.id === id) + 1
    const sb = sbs.value.find(s => s.id === id)
    return {
      label: `#${String(index).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`,
      value: id,
    }
  }),
])
const gridFrameTypeOptions = computed(() => {
  return [
    { label: '首帧', value: 'first_frame' },
    { label: '尾帧', value: 'last_frame' },
    { label: '参考图', value: 'reference' },
  ]
})
const gridAssignedCount = computed(() => gridAssignments.value.filter(item => !!item.storyboard_id).length)
const gridAssignmentPageSize = computed(() => {
  if (gridAssignments.value.length >= 25) return 8
  if (gridAssignments.value.length >= 16) return 10
  if (gridAssignments.value.length >= 9) return 9
  return Math.max(1, gridAssignments.value.length || 1)
})
const gridAssignmentTotalPages = computed(() => Math.max(1, Math.ceil(gridAssignments.value.length / gridAssignmentPageSize.value)))
const gridAssignmentPageStart = computed(() => gridAssignmentPage.value * gridAssignmentPageSize.value)
const gridAssignmentPageEnd = computed(() => Math.min(gridAssignments.value.length, gridAssignmentPageStart.value + gridAssignmentPageSize.value))
const pagedGridAssignments = computed(() => {
  return gridAssignments.value
    .slice(gridAssignmentPageStart.value, gridAssignmentPageEnd.value)
    .map((assignment, offset) => ({
      assignment,
      index: gridAssignmentPageStart.value + offset,
    }))
})

function resetGridAssignments() {
  gridAssignmentsState.value = createGridAssignments()
  activeGridCell.value = 0
  gridAssignmentPage.value = 0
}

function gridCellLabel(a) {
  if (!a?.storyboard_id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === a.storyboard_id) + 1
  const suffix = { first_frame: '首', last_frame: '尾', reference: '参' }[a.frame_type] || ''
  return `#${idx}${suffix ? ` ${suffix}` : ''}`
}

function gridCellTitle(id) {
  if (!id) return '未分配'
  const idx = sbs.value.findIndex(s => s.id === id) + 1
  const sb = sbs.value.find(s => s.id === id)
  return `#${String(idx).padStart(2, '0')} ${sb?.title || sb?.description || '镜头'}`
}

function updateGridAssignment(index, field, value) {
  const next = [...gridAssignmentsState.value]
  next[index] = { ...next[index], [field]: value }
  gridAssignmentsState.value = next
  activeGridCell.value = index
  if (gridImagePath.value) persistGridImagePath(gridImagePath.value)
}

function focusGridCell(index) {
  activeGridCell.value = index
  gridAssignmentPage.value = Math.floor(index / gridAssignmentPageSize.value)
}

const gridOverlayStyle = computed(() => {
  const { rows, cols } = gridActualLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

const gridAutoLayout = computed(() => {
  return gridLayoutShape.value
})

const gridBlankStyle = computed(() => {
  const { rows, cols } = gridAutoLayout.value
  return { 'grid-template-columns': `repeat(${cols}, 1fr)`, 'grid-template-rows': `repeat(${rows}, 1fr)` }
})

// Production step helpers
function prodStepDone(id) {
  if (id === 'chars') return !visualCharTotal.value || charImgCount.value === visualCharTotal.value
  if (id === 'scenes') return !!scenes.value.length && sceneImgCount.value === scenes.value.length
  if (id === 'dubbing') return !!sbs.value.length && (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)
  if (id === 'shots') return !!sbs.value.length && shotImgCount.value === sbs.value.length
  if (id === 'videos') return !!sbs.value.length && shotVidCount.value === sbs.value.length
  if (id === 'compose') return !!sbs.value.length && composedCount.value === sbs.value.length
  return false
}
const canExport = computed(() => !!sbs.value.length && composedCount.value === sbs.value.length)
function goNextProd() {
  if (prodTabIdx.value < prodTabDefs.value.length - 1) {
    prodTabIdx.value++
  } else {
    panel.value = 'export'
  }
}

// Script step navigation
const stepLabels = ['原始内容', 'AI 改写', '提取', '性别', '分镜']
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === 4) return '进入制作'
  return stepLabels[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
  if (scriptStep.value === 2) return chars.value.length > 0
  if (scriptStep.value === 3) return charsVoiced.value > 0
  if (scriptStep.value === 4) return sbs.value.length > 0
  return false
})
function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
function goNextStep() {
  if (scriptStep.value === 0 && localRaw.value.trim()) { saveRaw() }
  if (scriptStep.value === 1 && localScript.value.trim()) { saveScr() }
  if (scriptStep.value === 4) { panel.value = 'production'; return }
  if (canGoNext.value) scriptStep.value++
}

function gridSelectAll() {
  if (gridSelected.value.length === sbs.value.length) gridSelected.value = []
  else gridSelected.value = sbs.value.map(s => s.id)
}

function openGridTool() {
  gridStep.value = 0
  gridSelected.value = []
  gridSingleTarget.value = null
  gridActiveShotIds.value = []
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  gridPromptStatus.value = ''
  gridAssignmentsState.value = []
  gridDialog.value = true
}

function persistGridImagePath(value) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(gridStorageKey.value)
    return
  }
  const current = restoreGridState() || {}
  const entries = current.entries || {}
  entries[value] = {
    generationId: gridGenId.value,
    layout: gridActualLayout.value,
    shotIds: gridActiveShotIds.value,
    assignments: gridAssignmentsState.value,
    recoveredAt: gridRecoveredAt.value,
    recoveredMode: gridRecoveredMode.value,
  }
  const payload = {
    activeImagePath: value,
    entries,
  }
  window.localStorage.setItem(gridStorageKey.value, JSON.stringify(payload))
}

function restoreGridState() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(gridStorageKey.value)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { activeImagePath: raw, entries: { [raw]: {} } }
  }
}

function applyGridState(imagePath, meta = {}) {
  gridImagePath.value = imagePath || ''
  gridGenId.value = meta.generationId || meta.id || null
  if (meta.layout?.rows && meta.layout?.cols) gridActualLayout.value = meta.layout
  if (Array.isArray(meta.shotIds)) gridActiveShotIds.value = meta.shotIds
  else gridActiveShotIds.value = []
  if (Array.isArray(meta.assignments)) gridAssignmentsState.value = meta.assignments
  else gridAssignmentsState.value = []
  gridRecoveredAt.value = meta.recoveredAt || meta.createdAtLabel || ''
  gridRecoveredMode.value = meta.recoveredMode || meta.modeLabel || ''
}

function selectGridHistory(item) {
  const cached = restoreGridState()
  const cachedEntry = cached?.entries?.[item.localPath] || {}
  applyGridState(item.localPath, {
    ...item,
    ...cachedEntry,
    generationId: cachedEntry.generationId || item.id,
    recoveredAt: cachedEntry.recoveredAt || item.createdAtLabel,
    recoveredMode: cachedEntry.recoveredMode || item.modeLabel,
  })
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  persistGridImagePath(item.localPath)
}

function reopenGridPreview() {
  if (!gridImagePath.value) {
    openGridTool()
    return
  }
  gridDialog.value = true
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 3
}

function parseGridLayoutFromFrameType(value) {
  const match = String(value || '').match(/grid_[^_]+_(\d+)x(\d+)$/)
  if (!match) return null
  return { rows: Number(match[1]) || 3, cols: Number(match[2]) || 3 }
}

function continueGridSplit() {
  if (!gridImagePath.value) {
    toast.warning('还没有可继续切割的宫格图')
    return
  }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridDialog.value = true
  gridStep.value = 3
}

function getGridPromptShotIds() {
  if (gridMode.value === 'multi_ref') return gridSingleTarget.value ? [gridSingleTarget.value] : []
  if (gridMode.value === 'first_last') return [...gridSelected.value]
  return gridSelected.value.slice(0, gridTotalCells.value)
}

async function generateGridPrompt() {
  if (!gridCanStart.value) {
    toast.warning('请先选择镜头')
    return
  }
  gridPromptLoading.value = true
  gridPromptStatus.value = '正在调用 AI 生成宫格提示词...'
  gridPromptText.value = ''
  gridCellPrompts.value = []
  gridPromptSource.value = ''
  try {
    const shotIds = getGridPromptShotIds()
    const { rows, cols } = gridAutoLayout.value

    const res = await gridAPI.prompt({
      storyboard_ids: shotIds,
      drama_id: dramaId,
      episode_id: epId.value,
      rows,
      cols,
      mode: gridMode.value,
    })

    gridPromptText.value = res?.grid_prompt || ''
    gridCellPrompts.value = Array.isArray(res?.cell_prompts) ? res.cell_prompts : []
    gridPromptSource.value = res?.source || ''

    if (gridPromptText.value) {
      resetGridAssignments()
      gridPromptStatus.value = gridPromptSource.value === 'agent' ? 'AI 提示词已生成' : '已使用模板提示词'
      gridStep.value = 1
    } else {
      gridPromptStatus.value = ''
      toast.error('提示词生成失败')
    }
  } catch (e) {
    gridPromptStatus.value = ''
    toast.error(e?.message || '生成提示词失败')
  } finally {
    gridPromptLoading.value = false
  }
}

async function startGridGen() {
  let rows, cols, ids
  if (gridMode.value === 'multi_ref') {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = [gridSingleTarget.value]
  } else {
    rows = gridAutoLayout.value.rows; cols = gridAutoLayout.value.cols; ids = gridSelected.value.slice(0, gridTotalCells.value)
    if (gridMode.value === 'first_last') ids = [...gridSelected.value]
  }
  gridActiveShotIds.value = ids.filter(Boolean)
  gridActualLayout.value = { rows, cols }
  if (!gridAssignmentsState.value.length) resetGridAssignments()
  gridStep.value = 2
  gridStatusText.value = '提交生成请求...'
  try {
    const res = await gridAPI.generate({
      storyboard_ids: ids,
      drama_id: dramaId,
      rows,
      cols,
      mode: gridMode.value,
      custom_prompt: gridPromptText.value || undefined,
    })
    gridGenId.value = res.image_generation_id
    gridActualLayout.value = res.grid || { rows, cols }
    gridStatusText.value = '等待图片生成...'
    pollGridStatus()
  } catch (e) {
    toast.error(e.message)
    gridStep.value = 0
  }
}

async function pollGridStatus() {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const res = await gridAPI.status(gridGenId.value)
      gridStatusText.value = `状态: ${res.status}`
      if (res.status === 'completed' && res.local_path) {
        gridImagePath.value = res.local_path
        gridGenId.value = gridGenId.value || res.id || null
        persistGridImagePath(res.local_path)
        gridStep.value = 3
        return
      }
      if (res.status === 'failed') {
        toast.error(res.error_msg || '生成失败')
        gridStep.value = 0
        return
      }
    } catch {}
  }
  toast.error('生成超时'); gridStep.value = 0
}

async function loadLatestGridImage() {
  try {
    const rows = await imageAPI.list({ drama_id: dramaId })
    const list = Array.isArray(rows) ? rows : []
    const grids = list
      .filter((row) => row?.status === 'completed' && String(row?.frame_type || row?.frameType || '').startsWith('grid_') && (row?.local_path || row?.localPath))
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
      .map((row) => {
        const frameType = String(row?.frame_type || row?.frameType || '')
        const parsedLayout = parseGridLayoutFromFrameType(frameType) || { rows: 3, cols: 3 }
        return {
          id: row.id,
          localPath: row?.local_path || row?.localPath || '',
          layout: parsedLayout,
          modeLabel: frameType.replace(/^grid_/, '').replace(/_/g, ' · '),
          createdAtLabel: row?.created_at || row?.createdAt || '',
        }
      })

    gridHistory.value = grids

    const cached = restoreGridState()
    const preferredPath = cached?.activeImagePath && grids.some(item => item.localPath === cached.activeImagePath)
      ? cached.activeImagePath
      : grids[0]?.localPath
    const current = grids.find(item => item.localPath === preferredPath)
    if (current) {
      const cachedEntry = cached?.entries?.[current.localPath] || {}
      applyGridState(current.localPath, {
        ...current,
        ...cachedEntry,
        generationId: cachedEntry.generationId || current.id,
        recoveredAt: cachedEntry.recoveredAt || current.createdAtLabel,
        recoveredMode: cachedEntry.recoveredMode || current.modeLabel,
      })
      if (!gridAssignmentsState.value.length) resetGridAssignments()
      persistGridImagePath(current.localPath)
      return
    }
  } catch {}

  const cached = restoreGridState()
  if (cached?.activeImagePath) {
    const cachedEntry = cached?.entries?.[cached.activeImagePath] || {}
    applyGridState(cached.activeImagePath, {
      ...cachedEntry,
      recoveredAt: cachedEntry.recoveredAt || '',
      recoveredMode: cachedEntry.recoveredMode || '',
    })
  }
}

async function doGridSplit() {
  const { rows, cols } = gridActualLayout.value
  try {
    const assignments = gridAssignments.value
      .filter(item => !!item.storyboard_id)
      .map(item => ({ storyboard_id: item.storyboard_id, frame_type: item.frame_type }))
    if (!assignments.length) {
      toast.warning('请至少分配一个格子')
      return
    }
    await gridAPI.split({ image_generation_id: gridGenId.value, rows, cols, assignments })
    persistGridImagePath(gridImagePath.value)
    gridStep.value = 4
    toast.success('切分分配完成')
  } catch (e) {
    toast.error(e.message)
  }
}

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const ttsEligibleCount = computed(() => sbs.value.filter(s => isNarrationShot(s)).length)
const ttsGeneratedCount = computed(() => sbs.value.filter(s => isNarrationShot(s) && hasTTS(s)).length)
const shotImgCount = computed(() => sbs.value.filter(s => s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage).length)
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)

const prodTabDefs = computed(() => [
  { id: 'chars', label: '角色形象', icon: Users, badge: visualCharTotal.value ? `${charImgCount.value}/${visualCharTotal.value}` : '' },
  { id: 'scenes', label: '场景图片', icon: MapPin, badge: sceneImgCount.value ? `${sceneImgCount.value}/${scenes.value.length}` : '' },
  { id: 'shots', label: '镜头图片', icon: ImageIcon, badge: shotImgCount.value ? `${shotImgCount.value}/${sbs.value.length}` : '' },
  { id: 'videos', label: '视频生成', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${sbs.value.length}` : '' },
  { id: 'dubbing', label: '旁白配音', icon: Mic2, badge: '', beta: true },
  { id: 'compose', label: '视频合成', icon: Layers, badge: composedCount.value ? `${composedCount.value}/${sbs.value.length}` : '', beta: true },
])

const mainStageDefs = [
  { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
  { id: 'assets', label: '资产', desc: '角色、场景与音色', icon: FolderKanban },
  { id: 'storyboard', label: '分镜', desc: '镜头制作与合成', icon: Clapperboard },
  { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
]

const sidebarSections = computed(() => ([
  {
    id: 'script',
    label: '剧本',
    items: [
      { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!scriptContent.value },
      { key: 'script:extract', label: '提取', desc: '', icon: Users, done: !!chars.value.length },
      { key: 'script:voice', label: '性别', desc: '', icon: Mic2, done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'script:storyboard', label: '分镜', desc: '', icon: Clapperboard, done: !!sbs.value.length },
    ],
  },
  {
    id: 'production',
    label: '制作',
    items: [
      { key: 'prod:chars', label: '角色形象', desc: '', icon: Users, done: prodStepDone('chars') },
      { key: 'prod:scenes', label: '场景图片', desc: '', icon: MapPin, done: prodStepDone('scenes') },
      { key: 'prod:shots', label: '镜头图片', desc: '', icon: ImageIcon, done: prodStepDone('shots') },
      { key: 'prod:videos', label: '视频生成', desc: '', icon: Video, done: prodStepDone('videos') },
    ],
  },
  {
    id: 'beta',
    label: '测试功能',
    desc: '专业短剧建议下载视频上传剪映剪辑；以下为测试功能，音画同步仍在优化',
    items: [
      { key: 'prod:dubbing', label: '旁白配音', desc: '', icon: Mic2, done: prodStepDone('dubbing') },
      { key: 'prod:compose', label: '视频合成', desc: '', icon: Layers, done: prodStepDone('compose') },
      { key: 'export:merge', label: '一键剪辑', desc: '', icon: Download, done: !!mergeUrl.value },
    ],
  },
]))

const activeMainStage = computed(() => {
  if (panel.value === 'export') return 'export'
  if (panel.value === 'production') {
    return ['chars', 'scenes'].includes(prodTab.value) ? 'assets' : 'storyboard'
  }
  if (scriptStep.value <= 1) return 'script'
  if (scriptStep.value <= 3) return 'assets'
  return 'storyboard'
})

function mainStageDone(stageId) {
  if (stageId === 'script') return !!scriptContent.value
  if (stageId === 'assets') {
    const charsReady = !!chars.value.length && charsVoiced.value === chars.value.length
    const charImagesReady = !visualCharTotal.value || charImgCount.value === visualCharTotal.value
    const sceneImagesReady = !scenes.value.length || sceneImgCount.value === scenes.value.length
    return charsReady && charImagesReady && sceneImagesReady
  }
  if (stageId === 'storyboard') {
    if (!sbs.value.length) return false
    const ttsReady = !ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value
    return ttsReady
      && shotImgCount.value === sbs.value.length
      && shotVidCount.value === sbs.value.length
      && composedCount.value === sbs.value.length
  }
  if (stageId === 'export') return !!mergeUrl.value
  return false
}

function goMainStage(stageId) {
  if (stageId === 'script') {
    panel.value = 'script'
    scriptStep.value = Math.min(scriptStep.value, 1)
    return
  }
  if (stageId === 'assets') {
    const hasAssetWorkspace = !!visualCharTotal.value || !!scenes.value.length
    const hasPendingAssetGeneration = (visualCharTotal.value && charImgCount.value < visualCharTotal.value)
      || (scenes.value.length && sceneImgCount.value < scenes.value.length)
    if (panel.value === 'production' || hasPendingAssetGeneration || hasAssetWorkspace) {
      panel.value = 'production'
      prodTab.value = ['chars', 'scenes'].includes(prodTab.value) ? prodTab.value : 'chars'
      return
    }
    panel.value = 'script'
    scriptStep.value = chars.value.length ? 3 : 2
    return
  }
  if (stageId === 'storyboard') {
    if (panel.value === 'production') {
      prodTab.value = ['dubbing', 'shots', 'videos', 'compose'].includes(prodTab.value) ? prodTab.value : 'dubbing'
      return
    }
    panel.value = 'script'
    scriptStep.value = 4
    return
  }
  panel.value = 'export'
}

const activeSubSteps = computed(() => {
  if (activeMainStage.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
    ]
  }
  if (activeMainStage.value === 'assets') {
    return [
      { key: 'script:extract', label: '提取角色场景', done: !!chars.value.length },
      { key: 'script:voice', label: '分配性别', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'prod:chars', label: '角色形象', done: !visualCharTotal.value || charImgCount.value === visualCharTotal.value },
      { key: 'prod:scenes', label: '场景图片', done: !scenes.value.length || sceneImgCount.value === scenes.value.length },
    ]
  }
  if (activeMainStage.value === 'storyboard') {
    return [
      { key: 'script:storyboard', label: '分镜拆解', done: !!sbs.value.length },
      { key: 'prod:shots', label: '镜头图片', done: !!sbs.value.length && shotImgCount.value === sbs.value.length },
      { key: 'prod:videos', label: '视频生成', done: !!sbs.value.length && shotVidCount.value === sbs.value.length },
      { key: 'prod:dubbing', label: '旁白配音', done: !ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value },
      { key: 'prod:compose', label: '视频合成', done: !!sbs.value.length && composedCount.value === sbs.value.length },
    ]
  }
  return [
    { key: 'export:merge', label: '一键剪辑', done: !!mergeUrl.value },
  ]
})

const activeSubStepKey = computed(() => {
  if (panel.value === 'script') {
    if (scriptStep.value === 0) return 'script:raw'
    if (scriptStep.value === 1) return 'script:rewrite'
    if (scriptStep.value === 2) return 'script:extract'
    if (scriptStep.value === 3) return 'script:voice'
    return 'script:storyboard'
  }
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return 'export:merge'
})

const sidebarJumpSteps = computed(() => {
  const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
  return section?.items || []
})

const bubbleSteps = computed(() => {
  if (panel.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
      { key: 'script:extract', label: '提取', done: !!chars.value.length },
      { key: 'script:voice', label: '性别', done: !!chars.value.length && charsVoiced.value === chars.value.length },
      { key: 'script:storyboard', label: '分镜', done: !!sbs.value.length },
    ]
  }
  if (panel.value === 'production') {
    return prodTabDefs.value.map(step => ({
      key: `prod:${step.id}`,
      label: step.label,
      done: prodStepDone(step.id),
    }))
  }
  return []
})

const activeBubbleKey = computed(() => {
  if (panel.value === 'script') return activeSubStepKey.value
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return ''
})

const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

function goSubStep(key) {
  if (key.startsWith('script:')) {
    panel.value = 'script'
    const stepMap = {
      'script:raw': 0,
      'script:rewrite': 1,
      'script:extract': 2,
      'script:voice': 3,
      'script:storyboard': 4,
    }
    scriptStep.value = stepMap[key] ?? 0
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    return
  }
  panel.value = 'export'
}

const pipelineProgress = computed(() => {
  let p = 0
  if (rawContent.value) p++
  if (scriptContent.value) p++
  if (chars.value.length) p++
  if (charsVoiced.value) p++
  if (sbs.value.length) p++
  if (sbs.value.length && (!ttsEligibleCount.value || ttsGeneratedCount.value === ttsEligibleCount.value)) p++
  if (sbs.value.some(s => s.composed_image || s.composedImage)) p++
  if (sbs.value.some(s => s.video_url || s.videoUrl)) p++
  if (sbs.value.length && composedCount.value === sbs.value.length) p++
  if (mergeUrl.value) p++
  return p
})

const currentStageLabel = computed(() => {
  if (panel.value === 'script') return `剧本阶段 · ${stepLabels[scriptStep.value]}`
  if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
  return mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
})

const currentMainStageLabel = computed(() => {
  const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
  return current?.label || '工作台'
})

const currentSubStageLabel = computed(() => {
  const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
  return current?.label || currentStageLabel.value
})

function updateCharVoice(charId, voiceId) {
  characterAPI.update(charId, { voice_style: voiceId, voice_provider: lockedAudioProvider.value || undefined })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) {
    c.voice_style = voiceId
    c.voiceStyle = voiceId
    c.voice_provider = lockedAudioProvider.value || ''
    c.voiceProvider = lockedAudioProvider.value || ''
    c.voice_sample_url = ''
    c.voiceSampleUrl = ''
  }
}
function getVoiceProfile(voiceId) {
  return voiceProfiles.value.find(v => v.id === voiceId) || null
}
function genderOf(c) {
  const g = getVoiceProfile(c.voice_style || c.voiceStyle)?.gender || ''
  if (g.includes('男')) return '男'
  if (g.includes('女')) return '女'
  return ''
}
function setCharGender(c, gender) {
  if (genderOf(c) === gender) return
  const v = voiceProfiles.value.find(p => (p.gender || '').includes(gender))
  if (v) updateCharVoice(c.id, v.id)
}
// 视频卡：内联编辑视频提示词的展开态（同时只展开一个）
const vidBoard = reactive({ open: false, sbId: null })
const vidBoardSb = computed(() => sbs.value.find(s => s.id === vidBoard.sbId) || null)
function openVidBoard(sb) { vidBoard.sbId = sb.id; vidBoard.open = true }
// 这条视频实际由哪个模型生成（来自后端 video_provider/video_model）；兜底/下架历史模型标 warn
function videoModelInfo(sb) {
  const m = String(sb?.video_model || sb?.videoModel || '').toLowerCase()
  const p = String(sb?.video_provider || sb?.videoProvider || '').toLowerCase()
  if (!m && !p) return null
  if (m.includes('seedance') || p === 'volcengine') return { text: 'Seedance', warn: false }
  if (m.includes('pixverse') || p === 'pixverse') return { text: 'PixVerse', warn: false }
  if (m.includes('viduq3-pro')) return { text: 'Vidu Q3 Pro', warn: false }
  if (m.includes('viduq3') || p === 'vidu') return { text: 'Vidu Q3', warn: false }
  if (m.includes('happyhorse-1.1') || (p === 'ali' && m.includes('happyhorse'))) return { text: 'HappyHorse 1.1', warn: false }
  if (m.includes('happyhorse')) return { text: 'HappyHorse·兜底', warn: true }
  if (m.includes('veo')) return { text: 'Veo·兜底', warn: true }
  if (m.includes('sora')) return { text: 'Sora', warn: false }
  return { text: sb.video_model || sb.video_provider, warn: false }
}
// 故事板弹窗：用 storyboard_breaker skill 把视频提示词 AI 优化成电影级
const vidEnhancing = ref(false)
async function enhanceVidPrompt(sb) {
  if (!sb || vidEnhancing.value) return
  vidEnhancing.value = true
  try {
    const r = await storyboardAPI.enhanceVideoPrompt(sb.id, sb.video_prompt || sb.videoPrompt || '')
    if (r?.prompt) { updateField(sb, 'video_prompt', r.prompt); toast.success('视频提示词已优化') }
    else toast.error('AI 未返回结果')
  } catch (e) { toast.error(e.message || 'AI 优化失败') }
  finally { vidEnhancing.value = false }
}
// 旁白配音音色（复用音色库）：角色独白存该角色 voiceStyle；纯旁白存「旁白音色」(本地持久)
const voiceSelectOptions = computed(() => voiceProfiles.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const narratorVoice = ref(typeof localStorage !== 'undefined' ? (localStorage.getItem('narratorVoice:' + epId.value) || '') : '')
function narrationCharacter(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  if (!speaker) return null
  return chars.value.find(c => c.name === speaker) || null
}
function shotVoice(sb) {
  const ch = narrationCharacter(sb)
  if (ch) return ch.voice_style || ch.voiceStyle || ''
  return narratorVoice.value || ''
}
function setShotVoice(sb, voiceId) {
  const ch = narrationCharacter(sb)
  if (ch) { updateCharVoice(ch.id, voiceId); return }
  narratorVoice.value = voiceId
  try { localStorage.setItem('narratorVoice:' + epId.value, voiceId) } catch {}
}
// 旁白配音下拉：选音色后，若该条已配过音，立即用新音色重配，避免新旧不一致（选男声却还放旧的女声）
async function pickDubVoice(sb, voiceId) {
  setShotVoice(sb, voiceId)
  if (hasTTS(sb)) {
    toast.info('音色已改，正在用新音色重新配音…')
    await genShotTTS(sb)
  }
}
// 诊断：记录每条旁白「实际用了哪个音色 + 覆盖是否生效」，常驻显示在卡片上
const lastTts = reactive({})
// 合成时是否把旁白配音混入镜头（关掉则旁白镜头不混 TTS，避免旁白比镜头长被截断；旁白交给剪辑器）
const includeNarration = ref(typeof localStorage !== 'undefined' ? localStorage.getItem('includeNarration:' + epId.value) !== '0' : true)
function setIncludeNarration(v) { includeNarration.value = !!v; try { localStorage.setItem('includeNarration:' + epId.value, v ? '1' : '0') } catch {} }
const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))

const selectedSb = ref(null)
const shotTypes = [
  '大远景', '远景', '全景', '中景', '中近景', '近景', '特写', '大特写',
  '双人镜头', '三人镜头', '群像', '背影', '侧面', '正面', '俯视', '仰视',
  '过肩', '主观视角', '航拍', '运动镜头',
]
const shotAngles = ['平视', '仰视', '俯视', '侧拍', '背拍', '斜侧', '主观视角', '过肩']
// 运镜词表 —— 对齐 storyboard_breaker skill 运镜词库（AI 生成、用户可改，真实进提示词）
const shotMovements = [
  '固定', '推镜', '急推', '超级推', '拉镜', '急拉', '眩晕变焦',
  '摇镜', '俯仰', '横移', '甩镜', '升镜', '降镜', '过顶', '航拍拉升',
  '弧形环绕', '360环绕', '子弹时间', '跟拍', '手持', '主观视角',
  'FPV穿越机', '车载', '机械臂', '焦点转移', '荷兰角', '延时', '英雄机位',
]
// 专业电影维度 —— 布光 / 构图 / 情绪节拍（对齐 skill 词库，AI 生成、用户可改，真实进提示词）
const shotLighting = [
  '三点布光', '伦勃朗光', '蝴蝶光', '分割光', '环形光', '宽光', '窄光',
  '低调光', '高调光', '轮廓光', '逆光剪影', '顶光', '底光', '侧光',
  '黄金时刻', '蓝调时刻', '正午硬光', '阴天柔光', '窗光', '烛火', '月光',
  '霓虹', '屏幕光', '体积光',
]
const shotCompositions = ['三分法', '中心构图', '对角线', '前景框架', '纵深层次', '留白', '对称', '低角度', '俯瞰布局']
const shotEmotions = [
  '悬念铺垫', '情绪积累', '察觉异样', '对峙张力', '情绪爆发',
  '反转揭示', '释然回落', '留白余韵', '高光名场面',
  '温情', '甜蜜', '悲伤', '压抑',
]

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacterNames(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return chars.value.filter(char => ids.includes(char.id)).map(char => char.name)
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getSceneName(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return '未绑定场景'
  const scene = scenes.value.find(s => s.id === sceneId)
  return scene ? `${scene.location} · ${scene.time || '未设时间'}` : `场景 #${sceneId}`
}

async function deleteShot(sb) {
  if (!confirm('确定删除此镜头？')) return
  const idx = sbs.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await refresh()
  if (sbs.value.length) selectedSb.value = sbs.value[Math.min(idx, sbs.value.length - 1)]
  else selectedSb.value = null
}

const scriptSteps = computed(() => {
  const hasScript = !!scriptContent.value
  const hasChars = chars.value.length > 0 && hasScript
  const hasVoice = charsVoiced.value > 0 && hasChars
  const hasSbs = sbs.value.length > 0
  return [
    { label: '原始内容', state: rawContent.value ? 'done' : 'active', spinning: false },
    { label: 'AI 改写', state: hasScript ? 'done' : (rawContent.value ? 'active' : ''), spinning: rt.value === 'script_rewriter' },
    { label: '提取', state: hasChars ? 'done' : (hasScript ? 'active' : ''), spinning: rt.value === 'extractor' },
    { label: '性别', state: hasVoice ? 'done' : (hasChars ? 'active' : ''), spinning: rt.value === 'voice_assigner' },
    { label: '分镜', state: hasSbs ? 'done' : (hasVoice ? 'active' : ''), spinning: rt.value === 'storyboard_breaker' },
  ]
})

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  try {
    drama.value = await dramaAPI.get(dramaId)
    const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
    if (ep) {
      episode.value = ep
      try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
      sbs.value = await episodeAPI.storyboards(ep.id)
      if (sbs.value.length && !selectedSb.value) selectedSb.value = sbs.value[0]

      const epHasContent = !!(episode.value?.content)
      const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)
      const epHasSbs = sbs.value.length > 0

      if (!hasAutoPlacedInitialStep.value) {
        if (epHasSbs) scriptStep.value = 4
        else if (epHasScript && chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = 3
        else if (epHasScript && chars.value.length) scriptStep.value = 2
        else if (epHasScript || epHasContent) scriptStep.value = 1
        else scriptStep.value = 0
        hasAutoPlacedInitialStep.value = true
      }
      await loadLatestGridImage()
    }
  } catch (e) {
    toast.error(e.message)
  }
  try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh) }

function doNovelToScript() {
  saveRaw()
  runAgent('script_rewriter',
    '我提供的是一段长篇小说原文（不是剧本格式）。请按 novel_to_script Skill 的方法：① 输出剧集大纲（默认 60 集）② 输出第一集详细短剧剧本（含场景标题、动作描写、对白），第一集保存到当前集（save_script）。结果必须使用中文。',
    dramaId, epId.value, refresh)
}

function doScriptWrite() {
  saveRaw()
  runAgent('script_rewriter',
    '我提供的是一句话/几句话剧情梗概。请按 script_writer Skill 的方法原创整剧 — ① 拓展主角设定、核心冲突、金手指 ② 输出大纲 + 第一集详细剧本（场景头、动作、对白、强开场、结尾钩子），第一集保存到当前集（save_script）。结果必须使用中文。',
    dramaId, epId.value, refresh)
}

function doScriptPolish() {
  saveRaw()
  runAgent('script_rewriter',
    '我提供的是已有剧本初稿，请按 script_polish Skill 的方法做 4 维度专业润色（节奏、冲突、人物、对白），不改变核心剧情，只优化叙事质感。最后输出完整润色后剧本并 save_script 覆盖保存。结果必须使用中文。',
    dramaId, epId.value, refresh)
}
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  saveScr()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  scriptStep.value = 2
}
function closeExtractConfirm() {
  if (extractConfirm.saving) return
  extractConfirm.open = false
}

function applyExtractionDefaults(data) {
  extractConfirm.characters = (data?.characters || []).map(item => ({
    ...item,
    selection: item.action === 'ignore'
      ? 'ignore'
      : (item.existing_character_id ? `reuse:${item.existing_character_id}` : 'create'),
  }))
  extractConfirm.scenes = data?.scenes || []
  extractConfirm.projectCharacters = data?.project_characters || data?.projectCharacters || []
}

async function doExtract() {
  saveScr()
  if (!scriptContent.value && !localScript.value) {
    toast.warning('请先保存剧本')
    return
  }
  extractConfirm.loading = true
  try {
    const data = await agentExtractionAPI.prepare(dramaId, epId.value)
    applyExtractionDefaults(data)
    extractConfirm.open = true
  } catch (e) {
    toast.error(e.message || '角色提取失败')
  } finally {
    extractConfirm.loading = false
  }
}

async function confirmExtraction() {
  extractConfirm.saving = true
  try {
    const characters = extractConfirm.characters.map(item => {
      const selection = item.selection || 'create'
      if (selection === 'ignore') return { ...item, action: 'ignore', existing_character_id: null }
      if (selection.startsWith('reuse:')) {
        const id = Number(selection.replace('reuse:', ''))
        const pc = extractConfirm.projectCharacters.find(c => c.id === id)
        return {
          ...item,
          action: 'reuse',
          existing_character_id: id,
          name: pc?.name || item.name,
        }
      }
      return { ...item, action: 'create', existing_character_id: null }
    })
    const scenesPayload = extractConfirm.scenes.map(item => ({
      ...item,
      action: item.existing_scene_id ? 'reuse' : (item.action || 'create'),
    }))
    const result = await agentExtractionAPI.confirm(dramaId, epId.value, { characters, scenes: scenesPayload })
    toast.success(`已保存：复用 ${result.characters_reused || 0} 个角色，新增 ${result.characters_created || 0} 个角色`)
    extractConfirm.open = false
    await refresh()
  } catch (e) {
    toast.error(e.message || '保存失败')
  } finally {
    extractConfirm.saving = false
  }
}
function doVoice() { runAgent('voice_assigner', '请为所有角色判别性别并分配合适的音色（对白由模型按性别生成，旁白/独白用此音色真实配音）', dramaId, epId.value, refresh) }
function doBreakdown() {
  const cfg = videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
  const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'
  runAgent('storyboard_breaker', `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`, dramaId, epId.value, refresh)
}
async function addShot() { await storyboardAPI.create({ episode_id: epId.value, storyboard_number: sbs.value.length + 1, title: `镜头${sbs.value.length + 1}`, duration: 10 }); refresh() }

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 轮询专用的节流版全量刷新：多个生成任务并行轮询时（批量出图/出视频每个任务一个循环），
// 各自每 tick 调 refresh() 会叠加成每秒多次全量拉取，曾把服务器出口打满导致全站失联。
// 这里保证：并发调用共享同一次在途请求；两次真实刷新之间至少间隔 REFRESH_MIN_INTERVAL。
const REFRESH_MIN_INTERVAL = 3000
let refreshInFlight = null
let lastRefreshAt = 0
function refreshThrottled() {
  if (refreshInFlight) return refreshInFlight
  const wait = Math.max(0, REFRESH_MIN_INTERVAL - (Date.now() - lastRefreshAt))
  refreshInFlight = (async () => {
    try {
      if (wait) await sleep(wait)
      await refresh()
    } finally {
      lastRefreshAt = Date.now()
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function watchAsyncResult(check, attempts = 36, delay = 2500, onSettle) {
  void (async () => {
    try {
      for (let i = 0; i < attempts; i++) {
        await sleep(delay)
        await refreshThrottled()
        if (check()) return
      }
    } finally {
      // 无论命中结果还是轮询超时，都复位 pending，避免按钮永久卡在「生成中」
      if (onSettle) onSettle()
    }
  })()
}

async function genCharImg(id, opts = {}) {
  // 记下旧图地址：重新生成时旧图还在，必须等地址「变了」才算完成，否则「生成中」会秒消失
  const c0 = chars.value.find(c => c.id === id)
  const before = c0?.image_url || c0?.imageUrl || ''
  try {
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    await characterAPI.generateImage(id, epId.value, opts)
    toast.success('角色图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const char = chars.value.find(c => c.id === id)
      const cur = char?.image_url || char?.imageUrl || ''
      return !!cur && cur !== before
    }, 36, 2500, () => { pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id) })
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}

function openCharUpload(id) {
  const input = document.getElementById(`char-upload-${id}`)
  input?.click?.()
}

async function uploadCharImage(char, event) {
  const input = event?.target
  const file = input?.files?.[0]
  if (!file) return
  if (!file.type?.startsWith('image/')) {
    toast.error('请上传图片文件')
    input.value = ''
    return
  }
  if (file.size > 12 * 1024 * 1024) {
    toast.error('图片不能超过 12MB')
    input.value = ''
    return
  }
  const id = char.id
  const before = char?.image_url || char?.imageUrl || ''
  try {
    if (!isPendingCharUpload(id)) pendingCharUploadIds.value.push(id)
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    await characterAPI.uploadImage(id, file, epId.value)
    const target = chars.value.find(c => c.id === id)
    if (target) {
      target.view_side = null
      target.viewSide = null
      target.view_back = null
      target.viewBack = null
    }
    toast.success('参考图已导入，正在生成项目风格角色图')
    await refresh()
    watchAsyncResult(() => {
      const latest = chars.value.find(c => c.id === id)
      const cur = latest?.image_url || latest?.imageUrl || ''
      return !!cur && cur !== before
    }, 36, 2500, () => { pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id) })
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    toast.error(e.message || '上传失败')
  } finally {
    pendingCharUploadIds.value = pendingCharUploadIds.value.filter(item => item !== id)
    if (input) input.value = ''
  }
}

function charViewKey(id, view) { return `${id}:${view}` }
function isPendingCharView(id, view) { return pendingCharViewKeys.value.includes(charViewKey(id, view)) }

async function genCharView(id, view) {
  const key = charViewKey(id, view)
  if (isPendingCharView(id, view)) return
  const c0 = chars.value.find(c => c.id === id)
  const before = (view === 'side' ? (c0?.view_side || c0?.viewSide) : (c0?.view_back || c0?.viewBack)) || ''
  try {
    pendingCharViewKeys.value.push(key)
    await characterAPI.generateView(id, epId.value, view)
    toast.success(`${view === 'side' ? '侧面' : '背面'}视图生成中`)
    await refresh()
    watchAsyncResult(() => {
      const char = chars.value.find(c => c.id === id)
      const field = (view === 'side' ? (char?.view_side || char?.viewSide) : (char?.view_back || char?.viewBack)) || ''
      return !!field && field !== before
    }, 36, 2500, () => { pendingCharViewKeys.value = pendingCharViewKeys.value.filter(k => k !== key) })
  } catch (e) {
    pendingCharViewKeys.value = pendingCharViewKeys.value.filter(k => k !== key)
    toast.error(e.message)
  }
}
function batchCharImages() {
  const ids = visualChars.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
  if (!ids.length) { toast.info('所有角色图片已生成'); return }
  pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
  characterAPI.batchImages(ids, epId.value).then(async () => {
    toast.success('角色图片批量生成中')
    await refresh()
    watchAsyncResult(() => ids.every(id => {
      const char = chars.value.find(c => c.id === id)
      return !!(char?.image_url || char?.imageUrl)
    }), 36, 2500, () => { pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item)) })
  }).catch(e => {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  })
}
async function genSceneImg(id, opts = {}) {
  // 重新生成时旧图还在，必须等地址「变了」才算完成，否则会秒判完成、新图不刷新
  const s0 = scenes.value.find(s => s.id === id)
  const before = s0?.image_url || s0?.imageUrl || ''
  try {
    if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
    await sceneAPI.generateImage(id, epId.value, opts)
    toast.success('场景图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const scene = scenes.value.find(s => s.id === id)
      const cur = scene?.image_url || scene?.imageUrl || ''
      return !!cur && cur !== before
    }, 36, 2500, () => { pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id) })
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}

// === Custom Generate Dialog (lets user tweak prompt + choose character refs) ===
const customGenDialog = reactive({
  open: false,
  title: '',
  subtitle: '',
  defaultPrompt: '',
  defaultCharIds: null,
  onConfirm: null,  // ({ prompt, referenceCharacterIds }) => Promise
  onEnhance: null,  // async (currentPrompt) => newPrompt（传入才显示「AI 改写」）
})
function closeCustomGen() { customGenDialog.open = false }
async function handleCustomGenSubmit(payload) {
  if (customGenDialog.onConfirm) {
    try { await customGenDialog.onConfirm(payload) } catch (e) { toast.error(e.message || '操作失败') }
  }
}

function openCharCustomDialog(c) {
  customGenDialog.title = `自定义生成 · ${c.name || '角色'}立绘`
  customGenDialog.subtitle = (c.appearance || c.description) ? `角色设定：${String(c.appearance || c.description).slice(0, 80)}` : ''
  customGenDialog.defaultPrompt = c.image_prompt || c.imagePrompt || `${c.name}, ${c.appearance || c.description || '人物立绘'}, 高质量, 正面, 白色背景`
  customGenDialog.defaultCharIds = null
  customGenDialog.onConfirm = async ({ prompt }) => {
    await genCharImg(c.id, { prompt })
  }
  customGenDialog.onEnhance = async (current) => {
    try {
      const r = await characterAPI.enhancePrompt(c.id, current)
      return r.prompt
    } catch (e) {
      toast.error(e.message || 'AI 改写失败')
      return null
    }
  }
  customGenDialog.open = true
}
function openSceneCustomDialog(scene) {
  customGenDialog.title = `自定义生成 · ${scene.location || '场景'}`
  customGenDialog.subtitle = scene.prompt ? `场景描述：${scene.prompt.slice(0, 80)}` : ''
  customGenDialog.defaultPrompt = scene.prompt || `${scene.location || ''}, ${scene.time || ''}, 高质量场景, 电影感`
  customGenDialog.defaultCharIds = null  // null = auto mode by default
  customGenDialog.onEnhance = null
  customGenDialog.onConfirm = async ({ prompt, referenceCharacterIds }) => {
    await genSceneImg(scene.id, { prompt, referenceCharacterIds })
  }
  customGenDialog.open = true
}
function batchSceneImages() {
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) { toast.info('所有场景图片已生成'); return }
  pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
  ids.forEach(id => { sceneAPI.generateImage(id, epId.value).then(() => refresh()).catch(e => toast.error(e.message)) })
  toast.success('场景图片批量生成中')
  watchAsyncResult(() => ids.every(id => {
    const scene = scenes.value.find(s => s.id === id)
    return !!(scene?.image_url || scene?.imageUrl)
  }), 36, 2500, () => { pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => !ids.includes(item)) })
}

const IGNORE_TTS_SPEAKERS = /^(环境音|环境声|音效|效果音|sfx|sound ?effect|bgm|背景音|背景音乐|ambient)$/i
const IGNORE_TTS_TEXT = /^(无|无对白|无台词|无旁白|无需配音|无需对白|none|null|n\/a|na|环境音|环境声|音效|效果音|纯音效|纯环境音|只有环境音|仅环境音|背景音|背景音乐|bgm|sfx|ambient)$/i

function getDialogueSpeakerRaw(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  const match = dialogue.match(/^(.+?)[:：]/)
  return match ? match[1].replace(/[（(].+?[)）]/g, '').trim() : ''
}

function getDialogueText(sb) {
  const dialogue = sb?.dialogue?.trim() || ''
  return dialogue ? dialogue.replace(/^.+?[:：]\s*/, '').trim() : ''
}

function isTTSIgnorable(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  const text = getDialogueText(sb)
  if (!sb?.dialogue?.trim()) return true
  if (speaker && IGNORE_TTS_SPEAKERS.test(speaker)) return true
  if (!text) return true
  if (IGNORE_TTS_TEXT.test(text)) return true
  return false
}

function hasDialogue(sb) { return !isTTSIgnorable(sb) }
// 旁白镜头：有实质文本 + 说话人是旁白/画外音。对白已走 Seedance 原生音频，只有旁白还需 TTS 配音。
const NARRATOR_SPEAKERS = /^(旁白|画外音|voice ?over|narrator|os|ob|内心|内心独白|心声|独白)$/i
function isNarrationShot(sb) {
  if (isTTSIgnorable(sb)) return false
  const speaker = getDialogueSpeakerRaw(sb)
  return !!(speaker && NARRATOR_SPEAKERS.test(speaker))
}
function hasTTS(sb) { return !!(sb?.tts_audio_url || sb?.ttsAudioUrl) }
function getTTSUrl(sb) { return sb?.tts_audio_url || sb?.ttsAudioUrl || '' }
function getDialogueSpeaker(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  if (!speaker) return '旁白'
  return speaker
}
async function genShotTTS(sb) {
  try {
    const want = shotVoice(sb)
    const r = await storyboardAPI.generateTTS(sb.id, want)
    const used = r?.voice_id || r?.data?.voice_id || ''
    const label = getVoiceProfile(used)?.label || used || '默认'
    const ovr = (r?.override_received ?? r?.data?.override_received)
    const eng = r?.audio_engine || r?.data?.audio_engine || ''
    lastTts[sb.id] = { voice: label, override: !!ovr, engine: eng }
    toast.success(`配音已生成 · 实际音色：${label}${want && !ovr ? '（⚠️覆盖未生效）' : ''}`)
    await refresh()
  } catch (e) { toast.error(e.message) }
}
async function batchShotTTS() {
  const pending = sbs.value.filter(sb => isNarrationShot(sb) && !hasTTS(sb))
  if (!pending.length) {
    toast.info(ttsEligibleCount.value ? '所有镜头配音已生成' : '当前没有可生成的对白或旁白')
    return
  }
  const results = await Promise.allSettled(pending.map(sb => storyboardAPI.generateTTS(sb.id, shotVoice(sb))))
  const okCount = results.filter(r => r.status === 'fulfilled').length
  const failCount = results.length - okCount
  if (okCount) toast.success(`已生成 ${okCount} 条镜头旁白配音`)
  if (failCount) toast.error(`${failCount} 条镜头旁白配音失败`)
  await refresh()
}

function getFirstFrame(s) { return s?.first_frame_image || s?.firstFrameImage || null }
function getLastFrame(s) { return s?.last_frame_image || s?.lastFrameImage || null }
function getStoryboardCover(s) { return s?.composed_image || s?.composedImage || getFirstFrame(s) || getLastFrame(s) || null }
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || null }
function getComposedVideoUrl(s) { return s?.composed_video_url || s?.composedVideoUrl || null }
function getPlayableVideoUrl(s) { return getComposedVideoUrl(s) || getVideoUrl(s) }
function hasImg(s) { return !!getStoryboardCover(s) }
function hasVid(s) { return !!getVideoUrl(s) }
function hasComposed(s) { return !!getComposedVideoUrl(s) }

function getShotReferenceImages(sb, frameType) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  const pushCharacterRefs = () => {
    for (const charId of getStoryboardCharacterIds(sb)) {
      const char = chars.value.find(item => item.id === charId)
      pushRef(char?.image_url || char?.imageUrl)
    }
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = scenes.value.find(item => item.id === sceneId)

  if (frameType === 'last_frame') {
    pushRef(getFirstFrame(sb))
    pushCharacterRefs()
  } else {
    pushCharacterRefs()
  }
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const ref of getRefs(sb)) {
    pushRef(ref)
  }
  if (frameType === 'first_frame') {
    const idx = sbs.value.findIndex(item => item.id === sb.id)
    const prev = idx > 0 ? sbs.value[idx - 1] : null
    pushRef(getLastFrame(prev) || getFirstFrame(prev))
  }
  return refs.filter(Boolean).slice(0, 6)
}

function compactPromptText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function clipPromptText(value, maxLength = 180) {
  const text = compactPromptText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function pickVideoPromptBeat(videoPrompt, frameType) {
  const normalized = String(videoPrompt || '').replace(/<n\s*\/?>/gi, '\n')
  const taggedSegments = normalized
    .split(/\n+/)
    .map(compactPromptText)
    .filter(Boolean)
  if (taggedSegments.length > 1) {
    return frameType === 'first_frame'
      ? taggedSegments.slice(0, Math.min(2, taggedSegments.length)).join('；')
      : taggedSegments[taggedSegments.length - 1]
  }
  const text = compactPromptText(normalized)
  if (!text) return ''
  const parts = text
    .split(/(?=(?:^|[；;。.\n\s])(?:\d+(?:\.\d+)?\s*[-~—到至]\s*\d+(?:\.\d+)?\s*秒|第\s*\d+\s*秒))/)
    .map(item => compactPromptText(item).replace(/^[；;。.\s]+/, ''))
    .filter(Boolean)
  if (parts.length > 1) {
    return frameType === 'first_frame'
      ? parts.slice(0, Math.min(2, parts.length)).join('；')
      : parts[parts.length - 1]
  }
  const sentences = text.split(/[。！？!?；;\n]+/).map(compactPromptText).filter(Boolean)
  if (sentences.length > 1) return frameType === 'first_frame' ? sentences[0] : sentences[sentences.length - 1]
  return text
}

function buildShotImagePrompt(sb, frameType) {
  const isFirstFrame = frameType === 'first_frame'
  const frameLabel = isFirstFrame ? '首帧' : '尾帧'
  const title = sb.title || ''
  const description = sb.image_prompt || sb.imagePrompt || sb.description || ''
  const videoBeat = pickVideoPromptBeat(sb.video_prompt || sb.videoPrompt || '', frameType)
  const shotType = sb.shot_type || sb.shotType || ''
  const angle = sb.angle || ''
  const movement = sb.movement || ''
  const location = sb.location || getSceneName(sb)
  const time = sb.time || ''
  const charactersText = getStoryboardCharacterNames(sb).join('、')
  const action = sb.action || ''
  const result = sb.result || ''
  const dialogue = sb.dialogue || ''
  const atmosphere = sb.atmosphere || ''
  const frameHint = isFirstFrame
    ? '只生成这个镜头的首帧：剧情刚开始的状态，动作尚未完成，突出人物初始站位、冲突关系和动作起点。不要画出结局状态。'
    : '只生成这个镜头的尾帧：剧情推进后的结果状态，突出动作完成、情绪落点、位置变化或冲突后果。不要重复首帧构图。'
  const frameAction = isFirstFrame
    ? (action || videoBeat || description)
    : (result || videoBeat || action || description)
  const contrastHint = isFirstFrame
    ? '明确区分：这是起始关键帧，不要提前表现尾帧的动作完成、结果状态或情绪落点。'
    : '明确区分：这是结束关键帧，需要体现相对首帧发生后的变化，不要复刻首帧站位和动作起点。'
  // 视频动作里的"眨眼/扑闪"等瞬时动作会被图像模型画成眨到一半（单眼闭合），
  // 静帧必须显式禁止，否则重新生成多少次都是眨眼脸。
  const stillFrameHint = '静帧规则：这是一张静止的关键帧照片，眨眼、扑闪睫毛、打哈欠等瞬时动作绝不能出现在画面中；人物双眼自然睁开、目光清晰有神（除非剧情明确要求闭眼或睡着）。'

  return [
    `${frameLabel}生成目标：${frameHint}`,
    videoBeat ? `${frameLabel}剧情点：${videoBeat}` : '',
    frameAction ? `${isFirstFrame ? '动作起点' : '动作结果'}：${frameAction}` : '',
    contrastHint,
    stillFrameHint,
    title ? `镜头标题：${title}` : '',
    description ? `环境与视觉背景：${clipPromptText(description)}` : '',
    shotType ? `景别：${shotType}` : '',
    angle ? `机位：${angle}` : '',
    movement ? `运镜：${movement}` : '',
    charactersText ? `角色：${charactersText}` : '',
    location ? `地点：${location}` : '',
    time ? `时间：${time}` : '',
    action && !isFirstFrame ? `原始动作：${action}` : '',
    result && isFirstFrame ? `后续结果参考：${result}` : '',
    dialogue ? `对白/情绪依据：${dialogue}` : '',
    atmosphere ? `氛围：${atmosphere}` : '',
  ].filter(Boolean).join('；')
}

async function genShotFrame(sb, frameType, opts = {}) {
  const prompt = opts.prompt || buildShotImagePrompt(sb, frameType)
  const referenceImages = getShotReferenceImages(sb, frameType)
  const key = framePendingKey(sb.id, frameType)
  // 重新生成时旧帧还在，等地址「变了」才算完成
  const before = (frameType === 'first_frame' ? getFirstFrame(sb) : getLastFrame(sb)) || ''
  try {
    if (!pendingShotFrameKeys.value.includes(key)) pendingShotFrameKeys.value.push(key)
    const body = {
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: frameType,
      reference_images: referenceImages.length ? referenceImages : undefined,
    }
    // null = auto, array (even empty) = explicit choice
    if (Array.isArray(opts.referenceCharacterIds)) {
      body.reference_character_ids = opts.referenceCharacterIds
    }
    await imageAPI.generate(body)
    toast.success(frameType === 'first_frame' ? '首帧生成中' : '尾帧生成中')
    await refresh()
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === sb.id)
      const cur = (frameType === 'first_frame' ? getFirstFrame(target) : getLastFrame(target)) || ''
      return !!cur && cur !== before
    }, 36, 2500, () => { pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key) })
  } catch (e) {
    pendingShotFrameKeys.value = pendingShotFrameKeys.value.filter(item => item !== key)
    toast.error(e.message)
  }
}

function openShotCustomDialog(sb, frameType) {
  const label = frameType === 'first_frame' ? '首帧' : '尾帧'
  const num = String((sbs.value.findIndex(s => s.id === sb.id) + 1)).padStart(2, '0')
  customGenDialog.title = `自定义生成 · #${num} ${label}`
  const desc = sb.description || sb.action || sb.result || ''
  customGenDialog.subtitle = desc ? `分镜描述：${desc.slice(0, 80)}` : ''
  customGenDialog.defaultPrompt = buildShotImagePrompt(sb, frameType)
  customGenDialog.defaultCharIds = null  // auto by default
  customGenDialog.onEnhance = null
  customGenDialog.onConfirm = async ({ prompt, referenceCharacterIds }) => {
    await genShotFrame(sb, frameType, { prompt, referenceCharacterIds })
  }
  customGenDialog.open = true
}

async function genVid(sb) {
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: sb.video_prompt || sb.videoPrompt || '',
    duration: Number(sb.duration || 5),
    resolution: videoResolution.value,
    use_last_frame: videoUseLastFrame.value,
  }
  // 用户所选引擎（seedance / vidu / happyhorse_full / hailuo）——后端据此选主配置 + 计价。
  params.engine = videoEngine.value
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  const refs = getRefs(sb)
  if (videoEngine.value === 'happyhorse_full') {
    const allRefs = uniqueUrls([first, ...refs, last]).slice(0, 9)
    if (first) params.first_frame_url = first
    if (last) params.last_frame_url = last
    if (allRefs.length) Object.assign(params, { reference_mode: 'multiple', reference_image_urls: allRefs })
  } else if (first && last && videoUseLastFrame.value) { Object.assign(params, { reference_mode: 'first_last', first_frame_url: first, last_frame_url: last }) }
  else if (first) { Object.assign(params, { reference_mode: 'single', image_url: first }) }
  else if (refs.length) { Object.assign(params, { reference_mode: 'multiple', reference_image_urls: refs.filter(Boolean) }) }
  try {
    delete failedVideoMessages.value[sb.id]
    if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success('视频生成中')
    await refresh()
    await pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
    const message = humanizeError(e.message || '视频生成失败')
    failedVideoMessages.value = {
      ...failedVideoMessages.value,
      [sb.id]: message,
    }
    toast.error(message)
  } finally {
    // 本条结束（成功/失败）→ 腾出一个并发槽，放队列里的下一条进来
    pumpVideoQueue()
  }
}

// 按并发上限从队列里取镜头发起生成；一条完成就补一条，始终最多 videoConcurrency 条在跑
function pumpVideoQueue() {
  while (pendingVideoIds.value.length < videoConcurrency.value && videoQueue.value.length) {
    const id = videoQueue.value.shift()
    const sb = sbs.value.find(item => item.id === id)
    if (sb && !isPendingVideo(sb.id) && !hasVid(sb)) {
      genVid(sb) // genVid 在首个 await 前会同步把 id 推进 pendingVideoIds，故并发计数即时生效
    }
  }
}
async function pollVideoGeneration(generationId, storyboardId) {
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      return !!(target?.video_url || target?.videoUrl)
    }, 60, 4000, () => { pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId) })
    return
  }
  // ~26 分钟耐心：Seedance 选了之后可能先在后端「排队等位」(最多 10min) 再生成(~6min)，
  // status 为 queued/processing 时继续等，不要误判超时。
  for (let i = 0; i < 390; i++) {
    await sleep(4000)
    try {
      const res = await videoAPI.get(generationId)
      await refreshThrottled()
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        if ((res?.provider || '').toLowerCase() === 'minimax') {
          toast.success('海螺视频已生成 · 原片无声，请到「视频合成」混入配音')
        } else {
          toast.success('视频生成完成')
        }
        return
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        const message = humanizeError(res?.error_msg || res?.errorMsg || '视频生成失败')
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: message,
        }
        toast.error(message)
        return
      }
    } catch {}
  }
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
}

async function doCompose(sb) {
  try {
    delete failedComposeMessages.value[sb.id]
    if (!isPendingCompose(sb.id)) pendingComposeIds.value.push(sb.id)
    await composeAPI.shot(sb.id, includeNarration.value)
    toast.success('合成完成')
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    refresh()
  } catch (e) {
    pendingComposeIds.value = pendingComposeIds.value.filter(item => item !== sb.id)
    failedComposeMessages.value = {
      ...failedComposeMessages.value,
      [sb.id]: e.message,
    }
    toast.error(e.message)
  }
}
function batchVideos() {
  // 只排还没出片、且不在生成中/不在队列里的镜头
  const newIds = sbs.value
    .filter(s => !hasVid(s) && !isPendingVideo(s.id) && !isQueuedVideo(s.id))
    .map(s => s.id)
  if (!newIds.length) {
    toast.info('没有需要生成的镜头（都已出片或在队列中）')
    return
  }
  // 入队 → 按并发上限分批跑，避免一次性全发出去把上游挤爆
  videoQueue.value.push(...newIds)
  toast.success(`已加入队列 ${newIds.length} 条，每次并发 ${videoConcurrency.value} 条，自动排队生成`)
  pumpVideoQueue()
}
async function batchCompose() {
  await composeAPI.all(epId.value, includeNarration.value)
  pendingComposeIds.value = [...new Set(sbs.value.filter(sb => !!sb.video_url || !!sb.videoUrl).map(sb => sb.id))]
  toast.success('批量合成已开始')
  pollComposeStatus()
}
async function doMerge() {
  await mergeAPI.merge(epId.value); toast.success('拼接中...')
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
      clearInterval(poll)
      mergeData.value.status === 'completed' ? toast.success('拼接完成') : toast.error('拼接失败')
    }
  }, 3000)
}

const packaging = ref(false)
// 导出剪辑素材包：抓各镜头(含原生音轨)+镜头清单，前端打 zip 下载，可导入 OpenReel / 剪映 / CapCut 自由剪辑。
async function exportPackage() {
  if (packaging.value) return
  packaging.value = true
  try {
    const zip = new JSZip()
    const lines = ['文件\t景别\t时长(s)\t描述\t对白']
    let n = 0
    for (let i = 0; i < sbs.value.length; i++) {
      const sb = sbs.value[i]
      const rel = sb.composed_video_url || sb.composedVideoUrl || sb.video_url || sb.videoUrl
      if (!rel) continue
      const url = String(rel).startsWith('http') ? rel : '/' + String(rel).replace(/^\/+/, '')
      const blob = await (await fetch(url)).blob()
      const name = `镜头${String(i + 1).padStart(2, '0')}.mp4`
      zip.file(name, blob)
      lines.push(`${name}\t${sb.shot_type || sb.shotType || ''}\t${sb.duration || ''}\t${String(sb.description || sb.title || '').slice(0, 40)}\t${sb.dialogue || ''}`)
      n++
    }
    if (!n) { toast.error('没有可导出的镜头'); return }
    zip.file('镜头清单.txt', lines.join('\n'))
    const content = await zip.generateAsync({ type: 'blob' })
    const href = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = href
    a.download = `episode-${epId.value}-素材包.zip`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 4000) // 延迟回收：立即 revoke 会让大文件下载被中止
    toast.success(`已导出 ${n} 个镜头素材包，可导入 OpenReel / 剪映 剪辑`)
  } catch (e) {
    toast.error('导出失败：' + (e?.message || e))
  } finally {
    packaging.value = false
  }
}
function openOpenreel() { window.open('https://openreel.video', '_blank') }

function videoDownloadName(sb, i) {
  return `镜头${String(i + 1).padStart(2, '0')}.mp4`
}
const downloadingAll = ref(false)
// 一键下载全部：把所有「已生成的镜头原片」(video_url，非合成片) 打 zip 下载。
// 原片音画无问题、最适合拿去剪映精剪（合成/拼接片才有音画不同步问题）。
async function downloadAllVideos() {
  if (downloadingAll.value) return
  const targets = sbs.value.filter(s => s.video_url || s.videoUrl)
  if (!targets.length) { toast.error('还没有已生成的镜头视频'); return }
  downloadingAll.value = true
  toast.info(`正在打包 ${targets.length} 个镜头视频，请稍候…`)
  try {
    const zip = new JSZip()
    let n = 0
    for (let i = 0; i < sbs.value.length; i++) {
      const rel = sbs.value[i].video_url || sbs.value[i].videoUrl
      if (!rel) continue
      const url = String(rel).startsWith('http') ? rel : '/' + String(rel).replace(/^\/+/, '')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`镜头${i + 1} 下载失败（${res.status}）`)
      zip.file(`镜头${String(i + 1).padStart(2, '0')}.mp4`, await res.blob())
      n++
    }
    const content = await zip.generateAsync({ type: 'blob' })
    const href = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = href
    a.download = `episode-${epId.value}-镜头视频.zip`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 4000) // 延迟回收：立即 revoke 会让大文件下载被中止
    toast.success(`已打包下载 ${n} 个镜头视频`)
  } catch (e) {
    console.error('[downloadAllVideos]', e)
    toast.error('下载失败：' + (e?.message || e))
  } finally {
    downloadingAll.value = false
  }
}

async function pollComposeStatus() {
  for (let i = 0; i < 120; i++) {
    await sleep(3000)
    try {
      const res = await composeAPI.status(epId.value)
      await refreshThrottled()
      const items = Array.isArray(res?.items) ? res.items : []
      const processingIds = items.filter(item => item.status === 'compose_processing').map(item => item.id)
      pendingComposeIds.value = processingIds

      const failedItems = items.filter(item => item.status === 'compose_failed')
      if (failedItems.length) {
        const next = { ...failedComposeMessages.value }
        failedItems.forEach((item) => {
          next[item.id] = item.error_msg || item.errorMsg || '视频合成失败'
        })
        failedComposeMessages.value = next
      }

      if (!processingIds.length) {
        if (failedItems.length) toast.error(`有 ${failedItems.length} 个镜头合成失败`)
        else toast.success('批量合成完成')
        return
      }
    } catch {}
  }
}
function getRefs(sb) {
  const raw = sb.reference_images || sb.referenceImages
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function uniqueUrls(urls) {
  return Array.from(new Set(urls.map(u => String(u || '').trim()).filter(Boolean)))
}

async function loadConfigs() {
  try {
    const [imgCfgs, vidCfgs, audCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
    ])
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    audioConfigs.value = audCfgs || []
  } catch (e) { console.error('Failed to load AI configs', e) }
}

function inferVoiceGender(name, desc = []) {
  const text = `${name} ${Array.isArray(desc) ? desc.join(' ') : ''}`
  // 真正的「或」分组，先判女后判男；修复旧版字符集 [男|青年..] 把「青年女性」误判成男声的 bug
  if (/(女性|女声|女主|少女|御姐|大婶|闺蜜|奶奶|姐姐|妹妹|女孩|woman|female|girl|lady)/i.test(text)) return '女声'
  if (/(男性|男声|男主|大爷|大叔|先生|哥哥|弟弟|男孩|man|male|boy|gentleman)/i.test(text)) return '男声'
  return '中性'
}

function mapVoiceProfile(v) {
  const desc = Array.isArray(v.description) ? v.description : []
  return {
    id: v.voice_id,
    label: v.voice_name || v.voice_id,
    gender: inferVoiceGender(v.voice_name || v.voice_id, desc),
    traits: desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
    suitable: desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
  }
}

async function loadVoices() {
  try {
    const provider = lockedAudioProvider.value || 'minimax'
    const rows = await voicesAPI.list(provider)
    voiceProfiles.value = rows?.length ? rows.map(mapVoiceProfile) : fallbackVoiceProfiles
  } catch (e) {
    console.error('Failed to load voices', e)
    voiceProfiles.value = fallbackVoiceProfiles
  }
}

watch([lockedAudioConfigId, audioConfigs], () => { loadVoices() }, { deep: true })
onMounted(() => { refresh(); loadConfigs(); loadVoices() })
</script>

<style scoped>
/* ===== Studio Layout ===== */
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 14px;
  gap: 12px;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 28%),
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)),
    var(--bg-base);
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 18px;
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 14px 36px rgba(20, 32, 54, 0.07), 0 3px 10px rgba(20, 32, 54, 0.04);
  backdrop-filter: blur(16px);
}

.studio-topbar-main,
.sidebar,
.main {
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 18px 48px rgba(20, 32, 54, 0.08), 0 4px 14px rgba(20, 32, 54, 0.05);
  backdrop-filter: blur(16px);
}

.studio-topbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
}

.topbar-back {
  width: auto;
  min-width: 76px;
  padding: 0 8px;
  height: 28px;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 11px;
}

.studio-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.studio-overline {
  display: none;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.studio-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-title {
  font-size: 14px;
  line-height: 1;
  letter-spacing: -0.04em;
  white-space: nowrap;
}

.studio-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}

.studio-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.studio-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(18, 25, 42, 0.05);
  color: var(--text-2);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.studio-meta-pill.is-stage {
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
}
.studio-meta-pill.is-progress {
  background: rgba(45, 122, 69, 0.08);
  color: var(--success);
}
.studio-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.studio-topbar-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.studio-actions {
  display: flex;
  gap: 6px;
}
.studio-topbar .btn {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.sidebar {
  width: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: 28px;
}
.back-btn {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(27, 41, 64, 0.1); border-radius: 14px;
  background: rgba(255,255,255,0.8); color: var(--text-2);
  cursor: pointer; transition: all 0.15s;
  box-shadow: var(--shadow-xs);
}
.back-btn:hover { background: #fff; color: var(--text-0); }

/* Pipeline Nav */
.pipeline { flex: 1; overflow-y: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.pipe-section { display: flex; flex-direction: column; gap: 4px; }
.pipe-section-label {
  font-size: 10px; font-weight: 700; color: #95a1b6;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 2px 8px 3px;
}
.pipe-item {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: 17px;
  font-size: 12px; font-weight: 600;
  background: none; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.14s; width: 100%; text-align: left;
}
.pipe-item:hover { background: rgba(255,255,255,0.3); color: var(--text-0); }
.pipe-item.active {
  background: rgba(255,255,255,0.94);
  color: var(--text-0);
  border-color: rgba(27, 41, 64, 0.05);
  box-shadow: 0 8px 18px rgba(19, 33, 56, 0.045);
}
.pipe-item.done { color: var(--success); }
.pipe-item-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 7px 10px;
  position: relative;
  min-height: 42px;
}

.pipe-item-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 18px;
  top: 25px;
  bottom: -7px;
  width: 1px;
  background: rgba(27, 41, 64, 0.07);
}

.pipe-icon {
  width: 17px; height: 17px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(246,248,252,0.98); border: 1px solid rgba(18,25,42,0.08);
  color: #aab4c6; flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.pipe-item.active .pipe-icon { background: rgba(19, 51, 121, 0.07); border-color: rgba(19, 51, 121, 0.1); color: var(--accent-text); }
.pipe-item.done .pipe-icon { background: rgba(45, 122, 69, 0.96); border-color: rgba(45,122,69,0.18); color: #fff; }
.icon-active { background: var(--accent-dark) !important; border-color: var(--accent-dark) !important; color: #fff !important; }
.icon-done { background: var(--success) !important; border-color: var(--success) !important; color: #fff !important; }

.pipe-label { flex: 1; font-size: 11.5px; }
.pipe-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pipe-sub {
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.pipe-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.pipe-badge.badge-done { background: var(--success-bg); color: var(--success); }
.pipe-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.sidebar-bottom {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  display: flex; flex-direction: column; gap: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.72));
}
.sidebar-jumper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 3px 0 2px;
}
.sidebar-jump-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: rgba(45, 122, 69, 0.22);
  cursor: pointer;
  transition: transform 0.14s, background 0.14s, box-shadow 0.14s;
}
.sidebar-jump-dot:hover {
  transform: scale(1.08);
}
.sidebar-jump-dot.active {
  background: var(--accent-dark);
  box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14);
}
.sidebar-jump-dot.done {
  background: var(--success);
}
.sidebar-jump-dot.active.done {
  background: #1e3f8a;
}
.progress-wrap { display: flex; flex-direction: column; gap: 5px; }
.progress-head { display: flex; justify-content: space-between; }
.progress-label { font-size: 10.5px; color: var(--text-3); font-weight: 500; }
.progress-val { font-size: 10.5px; color: var(--text-2); font-family: var(--font-mono); font-weight: 600; }
.progress-track { height: 6px; background: rgba(194, 207, 227, 0.92); border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent-gradient); border-radius: 99px; transition: width 0.5s var(--ease-out); }
.refresh-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px; font-size: 11.5px; color: var(--text-2);
  background: rgba(255,255,255,0.86); border: 1px solid rgba(27, 41, 64, 0.08); border-radius: 999px;
  cursor: pointer; transition: all 0.15s;
}
.refresh-btn:hover { background: #fff; color: var(--text-0); }

/* ===== Main Content ===== */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; border-radius: 30px; }
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; }
.stage-subnav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.52));
  overflow-x: auto;
  flex-shrink: 0;
}
.stage-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.7);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.stage-subnav-item:hover {
  background: #fff;
  color: var(--text-0);
}
.stage-subnav-item.active {
  background: rgba(19, 51, 121, 0.08);
  border-color: rgba(19, 51, 121, 0.12);
  color: #1e3f8a;
}
.stage-subnav-item.done {
  color: var(--text-1);
}
.stage-subnav-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(45, 122, 69, 0.1);
}

/* Toolbar */
.step-toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); flex-shrink: 0;
}
.prod-toolbar { background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-indicator { display: flex; align-items: center; gap: 8px; }
.step-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(19, 51, 121, 0.08);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); letter-spacing: 0.05em;
}
.step-name { font-size: 13px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.step-editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-textarea {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12)); color: var(--text-0);
}
.fill-textarea:focus { box-shadow: none; }

/* Step Empty State */
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: rgba(255,255,255,0.8); color: var(--accent-text);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.step-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.step-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

/* Step Navigator Bubble */
.step-bubble {
  position: static;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.58));
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  margin-top: auto;
}
.bubble-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 500;
  border: 1px solid rgba(27, 41, 64, 0.08); background: rgba(255,255,255,0.84); color: var(--text-2); cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.bubble-btn:hover:not(:disabled) { background: #fff; color: var(--text-0); }
.bubble-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.bubble-btn.primary { margin-left: auto; background: linear-gradient(135deg, #557ff4, #345fcc); color: #fff; box-shadow: 0 6px 16px rgba(53, 95, 206, 0.2); border-color: transparent; }
.bubble-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.bubble-btn.primary:disabled { filter: none; box-shadow: none; opacity: 0.5; }
.bubble-dots { display: flex; gap: 7px; padding: 0 4px; }
.bubble-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(143, 160, 184, 0.4); cursor: pointer; transition: all 0.15s;
  border: none;
}
.bubble-dot.done { background: var(--success); }
.bubble-dot.current { background: var(--accent-dark); transform: scale(1.2); box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14); }

/* Extract grid */
.extract-stage { flex: 1; min-height: 0; overflow: hidden; padding: 12px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.extract-summary { padding: 16px; display: flex; flex-direction: column; gap: 14px; align-self: stretch; position: sticky; top: 0; max-height: 100%; }
.extract-summary-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.extract-summary-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.extract-summary-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.extract-summary-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.extract-summary-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 4px; }
.extract-summary-stat span { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.extract-summary-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.extract-summary-note { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); font-size: 11px; line-height: 1.7; color: var(--text-2); }
.extract-card { overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
.extract-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; font-size: 12px; font-weight: 600;
  border-bottom: 1px solid var(--border); background: var(--bg-1);
  color: var(--text-1);
}
.extract-list { padding: 8px 14px; flex: 1; min-height: 0; overflow-y: auto; }
.extract-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.extract-row + .extract-row { border-top: 1px solid var(--border); }
.char-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.scene-icon {
  width: 30px; height: 30px; border-radius: 6px;
  background: var(--bg-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); flex-shrink: 0;
}
.extract-info { min-width: 0; }
.extract-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.extract-name { font-size: 13px; font-weight: 600; }
.extract-meta { font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.extract-meta.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Voice grid */
.voice-stage { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.voice-stage-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  position: sticky;
  top: 0;
  min-height: 0;
  max-height: calc(100vh - 210px);
  overflow: hidden;
}
.voice-stage-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.voice-stage-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.voice-stage-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.voice-stage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.voice-stage-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 3px; }
.voice-stage-stat-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.voice-stage-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.voice-library-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.voice-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.voice-library-item { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); display: flex; flex-direction: column; gap: 4px; }
.voice-library-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-library-name { font-size: 13px; font-weight: 700; color: var(--text-0); }
.voice-library-traits { font-size: 11px; color: var(--text-1); }
.voice-library-fit { font-size: 10px; color: var(--text-3); line-height: 1.5; }

.voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-content: start; }
.voice-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; border-radius: 22px; min-height: 0; }
.voice-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.voice-char { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.voice-name { min-width: 0; flex: 1; }
.voice-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.voice-card-copy { min-height: 58px; }
.voice-card-text { font-size: 12px; line-height: 1.7; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.voice-select-block { display: flex; flex-direction: column; gap: 6px; }
.voice-block-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.gender-toggle { display: flex; gap: 8px; }
.gender-btn { flex: 1; height: 38px; border-radius: 10px; border: 1px solid rgba(19,51,121,0.18); background: rgba(255,255,255,0.7); color: var(--text-1); font-size: 14px; font-weight: 700; cursor: pointer; transition: all .15s ease; }
.gender-btn:hover { border-color: rgba(19,51,121,0.5); }
.gender-btn.active { background: var(--accent-dark); color: #fff; border-color: var(--accent-dark); }
.dub-voice { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.vboard-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.vboard-card { background: var(--bg-0, #fff); border-radius: 16px; width: min(720px, 96vw); max-height: 92vh; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.vboard-head { display: flex; align-items: center; }
.vboard-head .btn { margin-left: auto; }
.vboard-title { font-size: 16px; font-weight: 700; color: var(--text-0); }
.model-tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 5px; background: rgba(46,160,67,0.15); color: #2ea043; vertical-align: middle; }
.model-tag.warn { background: rgba(210,140,30,0.18); color: #c8841e; }
.engine-seg { display: inline-flex; flex-shrink: 0; border: 1px solid #dce3ee; border-radius: 8px; overflow: hidden; height: 28px; }
.engine-opt { display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; font-size: 12px; font-weight: 600; color: #60718a; background: #fff; border: none; cursor: pointer; transition: all .15s; height: 100%; font-family: inherit; white-space: nowrap; }
.engine-opt + .engine-opt { border-left: 1px solid #dce3ee; }
.engine-opt:hover { background: #f4f7fb; }
.engine-opt.active { background: linear-gradient(135deg, #C2F84E 0%, #8FEF26 100%); color: #0a0e1a; }
.engine-opt.disabled,
.engine-opt:disabled { color: #9aa8bb; background: #f3f6fa; cursor: not-allowed; opacity: .72; }
.engine-opt.disabled:hover,
.engine-opt:disabled:hover { background: #f3f6fa; }
.engine-tag { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: rgba(50,74,114,0.1); opacity: .85; white-space: nowrap; }
.engine-tag.good { background: rgba(210,140,30,0.18); color: #c8841e; }
.engine-tag.down { background: rgba(148,163,184,0.22); color: #64748b; }
.engine-opt.active .engine-tag { background: rgba(10,14,26,0.14); color: #0a0e1a; }
.engine-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid rgba(210, 140, 30, 0.2);
  border-radius: 10px;
  background: rgba(210, 140, 30, 0.08);
  color: #8a6a1e;
  font-size: 12px;
  line-height: 1.5;
}
.video-ref-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  border-radius: 8px;
  background: rgba(255,255,255,0.72);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.video-ref-toggle input { accent-color: #8FEF26; margin: 0; }
.video-ref-toggle:has(input:checked) {
  color: #183300;
  border-color: rgba(105, 214, 24, 0.45);
  background: rgba(194, 248, 78, 0.18);
}
.video-ref-toggle.board-toggle { margin-left: 6px; }
.btn-download { background: #324a72; color: #fff; border-color: #324a72; }
.btn-download:hover:not(:disabled) { background: #26395a; border-color: #26395a; }
.prod-tab-beta { font-size: 9px; font-weight: 700; padding: 0 4px; border-radius: 4px; background: rgba(210,140,30,0.18); color: #c8841e; margin-left: 3px; }
.pipe-section-desc { font-size: 10.5px; line-height: 1.5; color: #9aa7bd; padding: 1px 8px 7px; }
.beta-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; padding: 10px 14px; background: rgba(210,140,30,0.08); border: 1px solid rgba(210,140,30,0.22); border-radius: 10px; color: #8a6a1e; font-size: 12.5px; line-height: 1.6; }
.beta-note svg { flex-shrink: 0; margin-top: 2px; color: #c8841e; }
.beta-note b { color: #6b4e12; font-weight: 700; }
.vboard-hint { font-size: 12px; color: var(--text-2); line-height: 1.55; background: rgba(19,51,121,0.06); border-radius: 10px; padding: 8px 12px; }
.vboard-frames { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.vboard-frame { display: flex; flex-direction: column; gap: 6px; }
.vboard-frame-label { font-size: 11px; font-weight: 700; color: var(--text-3); }
.vboard-frame-media { aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; background: var(--bg-1, #eee); display: flex; align-items: center; justify-content: center; }
.vboard-frame-media img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
.vboard-frame-empty { font-size: 12px; color: var(--text-3); }
.vboard-field { display: flex; flex-direction: column; gap: 6px; }
.vboard-foot { display: flex; align-items: center; gap: 8px; }
.voice-profile-card { padding: 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(19, 51, 121, 0.08), rgba(255,255,255,0.78)); border: 1px solid rgba(19, 51, 121, 0.1); display: flex; flex-direction: column; gap: 4px; }
.voice-profile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-profile-name { font-size: 13px; font-weight: 700; color: var(--accent-text); }
.voice-profile-traits { font-size: 11px; color: var(--text-1); }
.voice-profile-fit { font-size: 10px; color: var(--text-2); line-height: 1.5; }
.voice-actions-row { display: flex; align-items: center; gap: 8px; }
.voice-player audio { width: 100%; height: 30px; border-radius: var(--radius); }
.char-avatar.lg { width: 38px; height: 38px; font-size: 16px; }

/* Split layout (storyboard) */
.split-layout { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.shot-list { width: 296px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-0); }
.shot-list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
}
.shot-list-title { font-size: 13px; font-weight: 700; color: var(--text-0); }
.shot-list-sub { margin-top: 3px; font-size: 11px; color: var(--text-3); line-height: 1.45; }
.shot-list-body { padding: 6px; }
.shot-item {
  position: relative; padding: 10px 11px; cursor: pointer;
  border: 1px solid transparent; border-left: 3px solid transparent;
  transition: all 0.15s;
  display: flex; flex-direction: column; gap: 5px;
  border-radius: 14px;
}
.shot-item + .shot-item { margin-top: 6px; }
.shot-item:hover { background: var(--bg-hover); border-color: rgba(27, 41, 64, 0.06); }
.shot-item.active {
  background: var(--bg-0);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-glow);
  z-index: 1;
}
.shot-item-header { display: flex; align-items: center; gap: 8px; }
.shot-num {
  font-size: 11px; font-family: var(--font-mono); font-weight: 700;
  color: var(--accent-text); background: var(--accent-bg);
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
  letter-spacing: 0.03em;
}
.shot-item.active .shot-num { background: var(--accent); color: #0a0e1a; }
.shot-status { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.shot-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.shot-dot.has-img { background: var(--success); }
.shot-dot.has-video { background: var(--info); }
.shot-dot.has-dialogue { background: var(--warning); }
.shot-body { }
.shot-desc { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-1); }
.shot-item.active .shot-desc { color: var(--text-0); }
.shot-meta { display: flex; align-items: center; gap: 6px; }
.shot-location {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shot-dialogue {
  font-size: 10px; color: var(--text-3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: 2px; border-left: 2px solid var(--border);
  padding-left: 6px;
}

.detail-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.detail-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.detail-head-copy { display: flex; flex-direction: column; gap: 2px; }
.detail-head-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.detail-head-sub { font-size: 11px; color: var(--text-3); }
.edit-hint { margin: 12px 14px 0; padding: 8px 12px; border-radius: 10px; background: rgba(19,51,121,0.06); border: 1px solid rgba(19,51,121,0.14); color: var(--text-1); font-size: 12px; line-height: 1.5; }
.detail-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(20,39,82,0.08), rgba(255,255,255,0.68));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.detail-hero-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.detail-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.detail-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.detail-preview-card { display: flex; flex-direction: column; gap: 6px; }
.detail-preview-title { font-size: 11px; font-weight: 700; color: var(--text-2); }
.detail-preview-media {
  position: relative; aspect-ratio: 16/9; overflow: hidden;
  border-radius: 14px; background: rgba(18,25,42,0.08);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-preview-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.detail-preview-empty {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 12px;
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-section-title { font-size: 12px; font-weight: 700; color: var(--text-0); }
.detail-section-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-row { display: flex; gap: 12px; }
.field-grid { display: grid; gap: 12px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.locked-config {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.12);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.locked-config-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.role-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.role-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  background: rgba(255,255,255,0.86);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.role-pill:hover { border-color: var(--accent); color: var(--text-0); }
.role-pill.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #0a0e1a;
  box-shadow: 0 8px 18px rgba(29, 77, 176, 0.18);
}

/* Production tabs */
.prod-tabs { display: flex; gap: 0; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.prod-tab {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px;
  border: none; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.15s; font-weight: 500;
}
.prod-tab:hover { color: var(--text-0); }
.prod-tab.active { background: var(--bg-0); color: var(--text-0); font-weight: 600; box-shadow: var(--shadow-xs); }
.prod-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); border-radius: 99px; }
.prod-tab.active .prod-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.prod-content { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
/* 内容限制最大宽度并居中：超宽屏不再无限拉伸铺满、显得很空；顶部控件与卡片网格一起对齐居中 */
.prod-content > * { width: 100%; max-width: 1760px; }
.prod-section-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.dub-grid { display: flex; flex-direction: column; gap: 10px; }
.dub-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58)); }
.dub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.dub-copy { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dub-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dub-desc { font-size: 13px; line-height: 1.6; color: var(--text-1); }
.dub-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11px; }
.dub-foot { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.dub-audio { flex: 1; min-width: 0; height: 30px; }

/* Asset grid */
/* 卡片自适应：最小宽随视口按比例缩放(13vw)，夹在 170~240px，平滑过渡 */
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(170px, 13vw, 240px), 1fr)); gap: clamp(12px, 1vw, 16px); }
.asset-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.asset-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.asset-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.asset-cover.wide { aspect-ratio: 16/9; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.previewable-image { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.previewable-image:hover { transform: scale(1.015); filter: saturate(1.04); }
.asset-cover-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7,11,21,0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.asset-cover-badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}
.asset-cover-badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}
.asset-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.asset-cover-loading {
  position: absolute; inset: 0; z-index: 3;
  background: rgba(15, 18, 30, 0.55); backdrop-filter: blur(2px);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
}
.asset-loading-bar { width: 72%; height: 4px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
.asset-loading-bar i { display: block; height: 100%; width: 40%; border-radius: 3px; background: var(--accent, #7c5cff); animation: assetBar 1.05s ease-in-out infinite; }
@keyframes assetBar { 0% { margin-left: -42%; } 100% { margin-left: 102%; } }
.asset-loading-text { font-size: 11px; font-weight: 600; color: #fff; letter-spacing: 0.04em; }
.asset-body { padding: 8px 10px; }
.asset-name { font-size: 13px; font-weight: 600; }
.asset-meta { font-size: 11px; }
/* flex-wrap：底栏按钮多于卡宽时换行，而不是被 .asset-card 的 overflow:hidden 裁掉（曾把「自定义」裁没） */
.asset-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; row-gap: 5px; padding: 6px 10px; border-top: 1px solid var(--border); }

/* Character 三视图 */
.char-views {
  padding: 6px 10px 8px;
  border-top: 1px solid var(--border);
}
.char-view-row {
  display: flex; align-items: center; gap: 6px;
}
.char-view-label {
  font-size: 10.5px;
  color: var(--text-3);
  font-weight: 500;
  letter-spacing: 0.02em;
  margin-right: 2px;
}
.char-view-slot {
  position: relative;
  flex: 1;
  aspect-ratio: 3/4;
  background: var(--bg-2);
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, background 0.15s;
}
.char-view-slot:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.char-view-slot img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.char-view-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 1px;
  color: var(--text-3);
  font-size: 10px;
}
.char-view-glyph {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  line-height: 1;
}
.char-view-plus { font-size: 12px; line-height: 1; color: var(--text-3); }
.char-view-regen {
  position: absolute;
  top: 2px; right: 2px;
  width: 16px; height: 16px;
  background: rgba(0,0,0,0.6);
  border: none;
  border-radius: 4px;
  color: #fff;
  display: none;
  align-items: center; justify-content: center;
  cursor: pointer;
  padding: 0;
  backdrop-filter: blur(3px);
}
.char-view-slot:hover .char-view-regen { display: flex; }
.char-view-regen:hover {
  background: var(--accent);
  color: #0a0e1a;
}

.extract-confirm-overlay {
  z-index: 1150;
  align-items: center;
  justify-content: center;
  padding: 22px;
}
.extract-confirm-dialog {
  width: min(920px, 96vw);
  max-height: min(760px, 92vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  box-shadow: 0 28px 80px rgba(18, 30, 54, 0.22);
}
.extract-confirm-head,
.extract-confirm-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
}
.extract-confirm-foot {
  border-bottom: 0;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}
.extract-confirm-title {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-0);
}
.extract-confirm-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-2);
}
.extract-confirm-body {
  padding: 18px 22px 22px;
  overflow: auto;
}
.extract-section-title {
  margin: 4px 0 10px;
  font-size: 13px;
  font-weight: 900;
  color: var(--text-0);
}
.extract-map-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
.extract-map-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-0);
}
.extract-char-info { min-width: 0; }
.extract-char-name {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-0);
}
.extract-char-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.extract-select {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: var(--text-0);
  padding: 0 10px;
  font-weight: 700;
}
.extract-scene-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-2);
  font-size: 12px;
}
.extract-scene-summary span {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-0);
}

/* Frame grid */
.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: center; gap: 8px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent-text);
}
.frame-badge {
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent-text);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }

/* Frame action buttons (regen + custom) — 放在缩略图下方，文字清晰不挤 */
.frame-btns { display: flex; gap: 4px; width: 130px; margin-top: 2px; }
.frame-btn {
  height: 26px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  cursor: pointer; white-space: nowrap; padding: 0;
  background: var(--bg-2); border: 1px solid var(--border); color: var(--text-2);
  transition: all 0.15s;
}
.frame-btn:hover { border-color: var(--accent); color: var(--accent); }
.frame-btn-icon { width: 32px; flex: 0 0 32px; }
.frame-btn-edit {
  flex: 1;
  background: var(--accent); color: #0a0e1a; border-color: var(--accent);
}
.frame-btn-edit:hover { filter: brightness(1.08); color: #0a0e1a; border-color: var(--accent); }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent-dark);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.14);
}

/* Prod grid */
/* 卡片自适应：最小宽随视口按比例缩放(16vw)，夹在 200~280px。屏幕越大卡片越大、平滑过渡，无硬断点 */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(200px, 16vw, 280px), 1fr)); gap: clamp(12px, 1vw, 18px); }
.prod-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.prod-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.prod-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.prod-cover img { width: 100%; height: 100%; object-fit: cover; }
.prod-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.prod-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.prod-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 700;
  font-family: var(--font-mono); background: rgba(0,0,0,0.5); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-info { padding: 10px 12px 8px; }
.prod-desc { font-size: 12px; line-height: 1.4; }
.prod-meta-line { margin-top: 5px; font-size: 10px; color: var(--text-3); }
.prod-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--text-3); }
.prod-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.prod-actions { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.prod-actions .btn { flex: 1; justify-content: center; }

/* Image viewer */
.image-viewer-overlay {
  z-index: 120;
  padding: 28px;
  background: rgba(18, 24, 34, 0.68);
  backdrop-filter: blur(10px);
}
.image-viewer-dialog {
  width: min(1100px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92));
}
.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.image-viewer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  min-height: 0;
}
.image-viewer-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(8, 14, 24, 0.22);
  background: rgba(255,255,255,0.9);
}

/* Grid tool dialog */
.grid-tool { width: min(1320px, calc(100vw - 40px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; animation: scaleIn 0.2s var(--ease-out); }
.grid-tool-head { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.grid-tool-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.grid-tool-body-preview { overflow: hidden; min-height: 0; padding-bottom: 10px; }
.grid-tool-foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 4px; }
.grid-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, 400px);
  gap: 14px;
  min-height: 0;
  flex: 1;
  align-items: start;
}
.grid-preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-assignment-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 18px;
  background: rgba(255,255,255,0.66);
  overflow: hidden;
  max-height: min(70vh, 840px);
}
.grid-assign-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
}
.grid-assign-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-assign-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.grid-assign-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.86);
}
.grid-assign-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(246, 248, 252, 0.92);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Prompt preview */
.grid-prompt-summary { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.grid-prompt-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
.grid-prompt-text { font-size: 12px; color: var(--text-1); line-height: 1.7; }

.grid-blank-preview {
  display: grid;
  gap: 4px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 8px;
  min-height: 200px;
}
.grid-blank-cell {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
}
.grid-blank-cell.empty { opacity: 0.4; }
.grid-blank-cell-index { font-size: 10px; font-weight: 700; color: var(--accent-text); font-family: var(--font-mono); }
.grid-blank-cell-desc { font-size: 11px; color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.grid-mode-tabs { display: flex; gap: 6px; }
.grid-mode-tab { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg-0); cursor: pointer; transition: all 0.15s; text-align: left; }
.grid-mode-tab:hover { border-color: var(--border-strong); }
.grid-mode-tab.active { border-color: var(--accent); background: var(--accent-bg); }
.grid-config { display: flex; gap: 12px; align-items: flex-end; }
.grid-pick-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.grid-pick-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; }
.grid-pick-item:hover { background: var(--bg-hover); }
.grid-pick-item.selected { background: var(--accent-bg); }
.grid-pick-item input { accent-color: var(--accent); }
.grid-preview-wrap {
  border-radius: var(--radius);
  overflow: auto;
  border: 1px solid var(--border);
  background: rgba(14, 19, 28, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  max-height: min(70vh, 860px);
  padding: 10px;
}
.grid-preview-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: auto;
  line-height: 0;
}
.grid-preview-img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(66vh, 820px);
  object-fit: contain;
}
.grid-overlay { position: absolute; inset: 0; display: grid; }
.grid-overlay-cell {
  border: 1px dashed rgba(255,255,255,0.42);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4px 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.grid-overlay-cell.active {
  background: rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28);
}
.grid-cell-label { font-size: 10px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.5); padding: 1px 5px; border-radius: 3px; }
.grid-adjust-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
.grid-assign-info {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 12px 10px;
}
.grid-assign-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(27, 41, 64, 0.08);
}
.grid-assign-row.active {
  background: rgba(32, 86, 190, 0.05);
  border-radius: 12px;
  padding-left: 6px;
  padding-right: 6px;
}
.grid-assign-row:last-child { border-bottom: 0; }
.grid-assign-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.grid-assign-bind {
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.45;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid-history-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.64));
}
.grid-history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.grid-history-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-history-subtitle {
  font-size: 11px;
  color: var(--text-3);
}
.grid-history-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(160px, 182px);
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.grid-history-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.78);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.grid-history-item:hover {
  border-color: rgba(33, 88, 255, 0.18);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.grid-history-item.active {
  border-color: rgba(33, 88, 255, 0.26);
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.86));
  box-shadow: 0 14px 28px rgba(33, 88, 255, 0.12);
}
.grid-history-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(14, 19, 28, 0.05);
}
.grid-history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-history-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-history-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.grid-history-meta {
  font-size: 10.5px;
  color: var(--text-3);
  line-height: 1.45;
  word-break: break-word;
}

.latest-grid-strip {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.62));
}
.latest-grid-strip-thumb {
  width: 72px;
  height: 48px;
  padding: 0;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(14, 19, 28, 0.06);
  cursor: zoom-in;
  box-shadow: none;
}
.latest-grid-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.latest-grid-strip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.latest-grid-strip-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.latest-grid-strip-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}
.latest-grid-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-3);
}
.latest-grid-strip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Export */
.export-split { flex: 1; display: flex; min-height: 0; }
.export-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
.export-video { max-width: 720px; width: 100%; border-radius: var(--radius-lg); background: #000; }
.export-bar { display: flex; align-items: center; gap: 12px; margin-top: 16px; width: 100%; max-width: 720px; }
.export-list { width: 240px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.export-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.export-list-body { flex: 1; overflow-y: auto; padding: 6px; }
.exp-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); }
.exp-row:hover { background: var(--bg-hover); }

/* Shared */
.dim { color: var(--text-3); }

@media (max-width: 1240px) {
  .studio-body {
    grid-template-columns: 1fr;
  }

  .studio-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .studio-topbar-side {
    justify-content: space-between;
  }

  .split-layout,
  .export-split {
    flex-direction: column;
  }

  .sidebar {
    max-height: 340px;
  }

  .shot-list,
  .export-list {
    width: 100%;
  }

  .detail-panel {
    min-height: 420px;
  }

  .field-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .grid-tool {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .grid-preview-layout {
    grid-template-columns: 1fr;
  }

  .grid-preview-wrap,
  .grid-preview-img {
    max-height: 42vh;
  }

  .grid-assignment-pane {
    max-height: 42vh;
  }

  .grid-assign-columns {
    display: none;
  }

  .grid-assign-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

@media (max-width: 860px) {
  .studio {
    padding: 12px;
    gap: 12px;
  }

  .studio-topbar-main {
    align-items: flex-start;
  }

  .studio-topbar-side,
  .studio-actions {
    flex-wrap: wrap;
  }

  .toolbar-right,
  .step-bubble,
  .export-bar {
    flex-wrap: wrap;
  }

  .extract-grid,
  .voice-grid,
  .asset-grid,
  .prod-grid {
    grid-template-columns: 1fr;
  }

  .voice-stage {
    grid-template-columns: 1fr;
  }

  .extract-stage {
    grid-template-columns: 1fr;
  }

  .extract-summary {
    position: static;
  }

  .voice-stage-panel {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-hero {
    grid-template-columns: 1fr;
  }

  .field-grid-2,
  .field-grid-4 {
    grid-template-columns: 1fr;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

  .frame-btns {
    width: 100%;
  }

  .latest-grid-strip {
    grid-template-columns: 1fr;
  }

  .grid-history-list {
    grid-auto-columns: minmax(148px, 168px);
  }

  .latest-grid-strip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .latest-grid-strip-actions {
    justify-content: flex-start;
  }
}
</style>
