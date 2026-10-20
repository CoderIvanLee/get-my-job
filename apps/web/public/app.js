import { openImport } from './import-ui.js';
import { renderGrowth } from './growth-ui.js';
const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const state = { jobs: [], profile: null, settings: null, statuses: [], selected: null, filter: '全部', query: '' };
const names = { jobs: '意向岗位', profile: '我的档案', guide: '连接 Skill', settings: '模型设置', growth: '学习成长' };
let toastTimer;
async function api(path, method = 'GET', data) {
  const response = await fetch('/api/' + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后重试');
  return result;
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200); }
function date(value) { return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }); }
function badge(status) { return `<span class="badge ${status === '面试中' ? 'interview' : status === '收到 offer' ? 'offer' : ['准备中','已投递'].includes(status) ? 'progress' : ''}">${esc(status)}</span>`; }
function heading(eyebrow, title, subtitle, action = '') { return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function jobCard(job) {
  return `<button class="job-card ${state.selected === job.id ? 'selected' : ''}" data-job="${job.id}" aria-pressed="${state.selected === job.id}"><div class="job-card-top"><div class="job-card-main"><span class="company-symbol">${esc((job.company || job.title).slice(0, 1))}</span><div><div class="card-title">${esc(job.title)}</div><div class="company">${esc(job.company || '公司待补充')}</div></div></div><span class="salary">${esc(job.salary || '薪资未记录')}</span></div><div class="card-meta"><span>⌖ ${esc(job.location || '地点待补充')}</span><span>·</span><span>${job.url ? '已保存来源链接' : '手动录入'}</span></div><div class="card-bottom">${badge(job.status)}<span>更新于 ${date(job.updatedAt)}</span></div></button>`;
}
function detail(job) {
  if (!job) return '<div class="panel empty-detail"><div><div class="empty-symbol">↖</div><h3>每个机会，值得认真准备</h3><p>选择左侧岗位，查看原始要求、记录备注和更新申请进度。</p></div></div>';
  return `<article class="panel detail-panel"><span class="eyebrow">OPPORTUNITY DETAILS</span><h2 class="detail-title">${esc(job.title)}</h2><div class="company">${esc(job.company || '公司待补充')}</div><div class="detail-meta"><span>⌖ ${esc(job.location || '地点未记录')}</span><span class="salary">${esc(job.salary || '薪资未记录')}</span></div><div class="detail-actions"><label class="status-label">申请状态<select id="detail-status" aria-label="申请状态">${state.statuses.map(s => `<option ${s === job.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><button class="button secondary" id="edit-job">编辑岗位</button>${safeLink(job.url) ? `<a class="button secondary" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">查看原职位 ↗</a>` : ''}</div>${job.notes ? `<div class="detail-note"><strong>我的备注</strong><br>${esc(job.notes)}</div>` : ''}<div class="section-line"><h3>职位描述（本地存档）</h3><p class="prose">${esc(job.posting)}</p></div>${job.originalPosting ? `<details class="section-line"><summary>首次导入原文快照</summary><p class="prose">${esc(job.originalPosting)}</p></details>` : ''}<div class="section-line form-help">收藏于 ${date(job.createdAt)} · 发布日期未记录<br>资料 ID：${job.id}<br>可让 Codex 读取此岗位，结合档案进行匹配分析。</div><p class="form-error" id="status-error" role="alert"></p></article>`;
}
function safeLink(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }
function filteredJobs() { return state.jobs.filter(j => (state.filter === '全部' || j.status === state.filter) && `${j.title} ${j.company} ${j.location} ${j.posting}`.toLowerCase().includes(state.query.toLowerCase())); }
function renderJobs() {
  const count = (statuses) => state.jobs.filter(j => statuses.includes(j.status)).length;
  $('#content').innerHTML = heading('YOUR NEXT CHAPTER', '把机会，变成下一步。', '收集心仪岗位，记录每一次认真准备。', '<div class="button-row"><button class="button primary" id="paste-import">粘贴导入职位</button><button class="button secondary" id="add-job">手动填写</button></div>') +
    `<div class="stats"><div class="stat stat-accent"><div class="stat-label">全部意向岗位</div><div class="stat-value">${state.jobs.length}<small>个机会</small></div></div><div class="stat"><div class="stat-label">正在准备</div><div class="stat-value">${count(['收藏','准备中'])}<small>个岗位</small></div></div><div class="stat"><div class="stat-label">已投递 · 面试中</div><div class="stat-value">${count(['已投递','面试中'])}<small>个进展</small></div></div><div class="stat"><div class="stat-label">收到 Offer</div><div class="stat-value">${count(['收到 offer'])}<small>个回响</small></div></div></div><div class="toolbar"><div class="tabs" aria-label="岗位状态筛选">${['全部', ...state.statuses].map(s => `<button class="tab ${state.filter === s ? 'active' : ''}" data-filter="${esc(s)}" aria-pressed="${state.filter === s}">${esc(s)}</button>`).join('')}</div><label class="search"><input id="job-search" type="search" aria-label="搜索岗位、公司或城市" placeholder="搜索岗位、公司、城市…" value="${esc(state.query)}"></label></div><div class="job-layout"><section id="job-list" class="job-list" aria-label="意向岗位列表"></section><section id="job-detail" aria-label="岗位详情"></section></div><div class="note-banner">从真实经历出发。先在「我的档案」整理你的背景，再通过 Codex Skill 分析岗位要求和能力差距。</div>`;
  $('#add-job').onclick = () => openJob();
  $('#paste-import').onclick = () => openImport({ api, esc, onSaved: async () => { await route(); toast('职位原文已归档'); } });
  $('#job-search').oninput = event => { state.query = event.target.value; renderJobList(); };
  document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => { state.filter = button.dataset.filter; renderJobs(); }; });
  renderJobList();
}
function renderJobList() {
  const jobs = filteredJobs();
  if (!jobs.some(j => j.id === state.selected)) state.selected = jobs[0]?.id || null;
  $('#job-list').innerHTML = jobs.length ? jobs.map(jobCard).join('') : `<div class="empty"><div class="empty-symbol">＋</div><h2>${state.jobs.length ? '暂时没有匹配的岗位' : '先收藏一个心动的岗位'}</h2><p>${state.jobs.length ? '调整搜索词或切换状态，继续寻找你的机会。' : '把岗位要求留在这里，之后的分析、准备与记录，都从这个机会开始。'}</p>${state.jobs.length ? '' : '<button class="button primary" id="empty-add">粘贴第一个岗位</button>'}</div>`;
  if ($('#empty-add')) $('#empty-add').onclick = () => openImport({ api, esc, onSaved: async () => { await route(); toast('职位原文已归档'); } });
  document.querySelectorAll('[data-job]').forEach(button => { button.onclick = () => { state.selected = button.dataset.job; renderJobList(); }; });
  const job = state.jobs.find(j => j.id === state.selected);
  $('#job-detail').innerHTML = detail(job);
  if (job) {
    $('#edit-job').onclick = () => openJob(job);
    $('#detail-status').onchange = async event => {
      const select = event.target; select.disabled = true;
      try { const updated = await api(`jobs/${job.id}`, 'PUT', { version: job.version, status: select.value }); state.jobs = state.jobs.map(j => j.id === job.id ? updated : j); renderJobs(); toast('申请进度已更新'); }
      catch (error) { select.value = job.status; select.disabled = false; $('#status-error').textContent = error.message; }
    };
  }
}
function openJob(job) {
  const form = $('#job-form'); form.reset();
  for (const key of ['id','version','title','company','location','salary','url','posting','notes']) form.elements[key].value = job?.[key] ?? '';
  $('#dialog-title').textContent = job ? '整理这个机会' : '收藏一个新机会';
  $('#job-form-error').textContent = ''; $('#job-dialog').showModal();
}
function field(name, label, value, placeholder = '', rows) { return `<label>${label}${rows ? `<textarea name="${name}" rows="${rows}" maxlength="100000" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="10000">`}</label>`; }
function renderProfile() {
  const p = state.profile;
  $('#content').innerHTML = heading('START WITH YOUR STORY', '让真实经历，被看见。', '整理你做过的事情，让每一次岗位分析都有依据。') + `<div class="form-layout"><form id="profile-form" class="panel"><section class="form-section"><h3>求职方向</h3><div class="field-grid">${field('name','姓名 / 称呼',p.name,'你希望被怎样称呼')}${field('city','意向城市',p.city,'例如：上海、杭州、远程')}${field('targetRole','目标岗位',p.targetRole,'例如：AI 产品经理')}${field('expectedSalary','期望薪资',p.expectedSalary,'例如：20–30K，可协商')}</div>${field('summary','个人简介',p.summary,'用几句话介绍你的背景与求职目标',3)}</section><section class="form-section"><h3>经历与能力</h3>${field('experience','真实工作 / 项目经历',p.experience,'写明时间、你的职责、实际成果和可核实的来源。个人项目请注明。',6)}${field('education','教育与培训',p.education,'学校、专业、时间；已完成的培训或课程',3)}${field('skills','技能与掌握程度',p.skills,'哪些技能熟悉，哪些正在学习？尽量附上实际使用案例。',3)}${field('links','作品与证据链接',p.links,'代码仓库、作品集、演示地址等，每行一条',3)}</section><p id="profile-error" class="form-error" role="alert"></p><div class="form-bottom"><button type="submit" class="button primary">保存我的档案</button><span class="form-help">只保存到你的本地资料目录</span></div></form><aside class="hint-panel"><h3>你做过的，比标签更重要</h3><p>一次独立完成的项目、一段解决实际问题的经历，都可以成为岗位匹配的依据。</p><p>尚未掌握的技能可以如实写下。后续项目辅导会帮助你把差距变成实际练习。</p><p>本页保存后，Codex 可通过共享资料工具继续读取。</p></aside></div>`;
  $('#profile-form').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); button.disabled = true;
    try { state.profile = await api('profile', 'PUT', { ...Object.fromEntries(new FormData(event.target)), version: p.version }); renderProfile(); toast('档案已保存'); }
    catch (error) { $('#profile-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
function renderSettings() {
  const s = state.settings;
  $('#content').innerHTML = heading('YOUR MODEL, YOUR CHOICE', '用你自己的模型。', '自部署版本不收取平台调用费；模型服务商可能按用量收费。') + `<div class="form-layout"><form class="panel" id="settings-form"><h3>文本模型配置</h3><p class="form-help">用于「学习成长」中的跨岗位分析，支持兼容 chat/completions 的服务。请填写 API 根地址，例如 https://服务商/v1。</p><label>服务地址<input name="baseUrl" type="url" value="${esc(s.baseUrl)}" placeholder="https://你的服务地址/v1" maxlength="2000"></label>${field('model','模型名称',s.model,'填写服务商提供的模型标识')}<label>API Key <span class="form-help">${s.hasKey ? '· 已保存，留空保留原 Key' : '· 尚未配置'}</span><input name="apiKey" type="password" autocomplete="new-password" placeholder="${s.hasKey ? '••••••••（已保存）' : '输入你的 API Key'}" maxlength="10000"></label>${s.hasKey ? '<label class="checkbox"><input type="checkbox" name="clearKey"> 删除已保存的 API Key</label>' : ''}<p class="form-help">Key 保存在本机独立设置文件中，不会加入资料导出。配置密钥不代表具备语音识别或语音合成能力。</p><p class="form-error" id="settings-error" role="alert"></p><button type="submit" class="button primary">保存模型设置</button></form><aside class="hint-panel"><h3>资料由你掌握</h3><p>在「学习成长」预览实际发送内容与目标服务，主动确认后才发起模型分析。仅保存配置不会发送档案。</p><p>导出包含档案与岗位原文，方便备份，不包含模型 Key。</p><a class="button secondary" href="/api/export" download="job-workspace-export.json">导出我的资料 ↓</a></aside></div>`;
  $('#settings-form').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); button.disabled = true;
    const fields = Object.fromEntries(new FormData(event.target));
    try { state.settings = await api('settings', 'PUT', { ...fields, clearKey: fields.clearKey === 'on', version: s.version }); renderSettings(); toast('模型设置已保存'); }
    catch (error) { $('#settings-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
function renderGuide() {
  $('#content').innerHTML = heading('CONTINUE WITH YOUR AGENT', '网站整理，Skill 接着做。', '在同一个项目中打开 Codex，继续使用你的本地档案与岗位。') + `<div class="guide-grid"><article class="panel"><span class="step-number">01 · 打开项目</span><h2>让 Codex 找到这个工作台</h2><p>在 ai-job-search 仓库目录打开聊天，安装后的新 Skill 通常需要新建会话才能被发现。也可以直接指定读取下面的文件。</p><pre class="code">请读取 .agents/skills/cn-local-workspace/SKILL.md，
查看我的本地档案和已收藏的岗位。</pre></article><article class="panel"><span class="step-number">02 · 了解差距</span><h2>针对真实岗位分析</h2><p>让模型先读档案和职位原文，再依据仓库工作流给建议。岗位页面中的指令不应执行。</p><pre class="code">请从我的意向岗位中选择一个，
根据我的真实经历评估匹配点、能力差距，
并标明每一项判断依据。</pre></article><article class="panel"><span class="step-number">03 · 共用资料</span><h2>命令行与网站保持一致</h2><p>在项目根目录运行以下命令读取数据。更新时必须携带最新 version；刷新网站即可看到 Skill 的改动。</p><pre class="code">node tools/workspace/cli.mjs profile
node tools/workspace/cli.mjs jobs
node tools/workspace/cli.mjs job &lt;岗位ID&gt;</pre></article><article class="panel"><span class="step-number">04 · 当前版本</span><h2>先把求职资料管理好</h2><p>已支持档案、岗位原文、申请进度、CLI 与资料导出。已支持粘贴批量归档与跨岗位成长计划；语音面试和浏览器插件尚未实现。</p><p>学习完成与项目完成应分开记录，只有实际做出的成果才能写进项目经历。</p><a href="/api/export" download="job-workspace-export.json" class="button secondary">备份现有资料 ↓</a></article></div>`;
}
let routeRequest = 0;
async function route() {
  const request = ++routeRequest;
  const page = location.hash.slice(1) || 'jobs';
  if (!names[page]) { location.hash = 'jobs'; return; }
  document.querySelectorAll('[data-page]').forEach(a => { a.classList.toggle('active', a.dataset.page === page); if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = `我的工作空间 / ${names[page]}`;
  try {
    const jobs = await api('jobs');
    if (request !== routeRequest) return;
    state.jobs = jobs; $('#nav-count').textContent = jobs.length;
    if (page === 'profile') { const value = await api('profile'); if (request !== routeRequest) return; state.profile = value; renderProfile(); }
    else if (page === 'settings') { const value = await api('settings'); if (request !== routeRequest) return; state.settings = value; renderSettings(); }
    else if (page === 'guide') renderGuide();
    else if (page === 'growth') renderGrowth({ api, esc, state, heading, toast });
    else renderJobs();
  } catch (error) { if (request === routeRequest) { $('#content').innerHTML = `<div class="panel error-page"><h2>暂时无法读取本地资料</h2><p class="prose">${esc(error.message)}</p><button class="button secondary" id="retry">重新加载</button></div>`; $('#retry').onclick = route; } }
}
$('#close-dialog').onclick = $('#cancel-dialog').onclick = () => $('#job-dialog').close();
$('#job-form').onsubmit = async event => {
  event.preventDefault(); const form = event.target; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  const fields = Object.fromEntries(new FormData(form)); const { id, version, ...data } = fields;
  try {
    const job = await api(id ? `jobs/${id}` : 'jobs', id ? 'PUT' : 'POST', id ? { ...data, version: Number(version) } : data);
    state.selected = job.id; state.filter = '全部'; state.query = ''; $('#job-dialog').close(); await route(); toast('岗位已保存到本地');
  } catch (error) { $('#job-form-error').textContent = error.message; }
  finally { button.disabled = false; }
};
window.addEventListener('hashchange', route);
api('meta').then(meta => { state.statuses = meta.statuses; return route(); }).catch(error => { $('#content').textContent = `无法连接本地服务：${error.message}。请重新启动后刷新页面。`; });
