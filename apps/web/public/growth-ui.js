export function renderGrowth({ api, esc, state, heading, toast }) {
  const content = document.querySelector('#content');
  content.innerHTML = heading('GROW TOWARD YOUR GOALS', '从岗位要求，找到成长方向。', '勾选多个岗位，提炼共同能力，并把差距拆成可以亲手完成的任务。') + `<div class="form-layout"><form class="panel" id="growth-form"><h3>选择 2–10 个目标岗位</h3><div class="growth-jobs">${state.jobs.length ? state.jobs.map(j => `<label class="checkbox growth-job"><input name="jobIds" type="checkbox" value="${j.id}"><span><strong>${esc(j.title)}</strong><br><small>${esc(j.company || '公司未记录')} · ${esc(j.status)}</small></span></label>`).join('') : '<p class="form-help">先到「意向岗位」粘贴导入至少两个职位。</p>'}</div><div class="field-grid"><label>学习周期（周）<input name="weeks" type="number" min="1" max="12" value="4" required></label><label>每周可投入（小时）<input name="hoursPerWeek" type="number" min="1" max="40" value="6" required></label></div><button type="submit" class="button primary">预览分析任务</button><p class="form-error" id="growth-error" role="alert"></p><div id="growth-preview"></div></form><aside class="hint-panel"><h3>有依据，也有实际产出</h3><p>能力需求引用具体岗位原文，涉及岗位数量由程序核对。学习计划围绕真实项目、演示和可检查成果。</p><p>档案没有提到的技能会标为待确认，不直接认定你不会。已经下架的岗位仍可使用本地原文分析。</p><p>可以用你配置的模型生成，也可以导出任务交给 Codex Skill。</p></aside></div><section id="growth-history" class="growth-history"><h2>已保存的计划</h2><p class="form-help">正在读取……</p></section>`;
  const $ = s => content.querySelector(s);
  let prepared = null; let request = null;
  const error = message => { if ($('#growth-error')) $('#growth-error').textContent = message; };
  $('#growth-form').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); button.disabled = true; error('');
    const data = new FormData(event.target); request = { jobIds: data.getAll('jobIds'), weeks: Number(data.get('weeks')), hoursPerWeek: Number(data.get('hoursPerWeek')) };
    try {
      prepared = await api('growth/prepare', 'POST', request);
      $('#growth-preview').innerHTML = `<div class="section-line"><h3>确认发送范围</h3><p class="form-help">以下完整档案与 ${prepared.context.jobs.length} 个岗位将发送给：<strong>${esc(prepared.target.baseUrl || '尚未配置服务地址')}</strong><br>模型：${esc(prepared.target.model || '未配置')}。服务商可能收费。</p><details><summary>展开查看实际资料</summary><pre class="code">${esc(JSON.stringify(prepared.context, null, 2))}</pre></details><label class="checkbox"><input type="checkbox" id="growth-consent"> 我同意将以上资料发送给所示模型服务</label><div class="form-bottom"><button type="button" class="button primary" id="generate-growth">生成成长计划</button><button type="button" class="button secondary" id="export-growth-task">导出任务给 Codex</button></div></div>`;
      $('#export-growth-task').onclick = () => {
        const blob = new Blob([prepared.prompt], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'growth-task.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('分析任务已导出，不包含模型 Key');
      };
      $('#generate-growth').onclick = async event => {
        if (!$('#growth-consent').checked) return error('请确认发送内容与目标服务，或选择导出给 Codex。');
        const button = event.target; button.disabled = true; button.textContent = '正在分析，可能需要两分钟…'; error('');
        try {
          await api('growth/generate', 'POST', { ...request, expectedContext: prepared.context, settingsVersion: prepared.target.settingsVersion, consent: true });
          toast('成长计划已保存'); await history();
        } catch (e) { error(e.message); }
        finally { button.disabled = false; button.textContent = '生成成长计划'; }
      };
    } catch (e) { error(e.message); }
    finally { button.disabled = false; }
  };
  $('#growth-form').addEventListener('change', event => { if (event.target.name === 'jobIds' || event.target.name === 'weeks' || event.target.name === 'hoursPerWeek') { prepared = null; $('#growth-preview').innerHTML = ''; } });
  async function history() {
    try {
      const plans = await api('growth/plans'); if (!$('#growth-history')) return;
      $('#growth-history').innerHTML = '<h2>已保存的计划</h2>' + (plans.length ? plans.map(p => `<article class="panel growth-plan"><div class="eyebrow">${esc(new Date(p.createdAt).toLocaleString('zh-CN'))} · ${esc(p.source)} · ${p.context.jobs.length} 个岗位</div><h3>${p.context.weeks} 周成长计划 · 每周 ${p.context.hoursPerWeek} 小时</h3><p class="prose">${esc(p.result.summary)}</p><h3 class="section-line">能力需求与证据</h3>${p.result.skills.map(s => `<section class="skill-evidence"><strong>${esc(s.name)}</strong> <span class="badge">${s.jobCount} / ${p.context.jobs.length} 个岗位提及</span><p>${esc(s.gap)}</p>${s.evidence.map(e => `<blockquote>${esc(e.quote)}<small>— ${esc(p.context.jobs.find(j => j.id === e.jobId)?.title || e.jobId)}</small></blockquote>`).join('')}</section>`).join('')}<h3 class="section-line">学习与实践安排</h3>${p.result.weeks.map(w => `<section class="week-plan"><span class="step-number">第 ${w.week} 周</span><h3>${esc(w.goal)}</h3><ul>${w.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p><strong>交付物：</strong>${esc(w.deliverable)}</p><p><strong>验收：</strong>${esc(w.acceptance)}</p></section>`).join('')}<details><summary>生成依据快照（后续岗位改动不影响此记录）</summary><pre class="code">${esc(JSON.stringify(p.context, null, 2))}</pre></details></article>`).join('') : '<p class="form-help">还没有计划。先选择目标岗位并预览任务。</p>');
    } catch (e) { if ($('#growth-history')) $('#growth-history').textContent = e.message; }
  }
  history();
}
