export function openImport({ api, esc, onSaved }) {
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '粘贴导入职位');
  dialog.innerHTML = `<form><div class="dialog-heading"><div><span class="eyebrow">SAVE BEFORE IT DISAPPEARS</span><h2>复制职位，粘贴即归档</h2></div><button type="button" class="icon-button" aria-label="关闭">×</button></div><p class="form-help">复制网页中的完整岗位内容，粘贴到下方。无需逐项填写。多个岗位用单独一行 --- 分隔。</p><label>职位原文<textarea id="paste-postings" rows="10" required maxlength="500000" placeholder="AI 应用开发工程师&#10;公司：示例公司&#10;地点：上海&#10;薪资：20–30K&#10;岗位职责与任职要求……&#10;---&#10;第二个岗位……"></textarea></label><p class="form-help">仅在本机提取信息。首次导入原文会留存，即使职位下架也可回看。此入口不会抓取网页链接。</p><div id="import-preview"></div><p class="form-error" id="import-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="button primary" id="preview-import">提取并预览</button><button type="button" class="button primary" id="save-import" hidden>确认归档</button></div></form>`;
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove()); dialog.querySelector('.icon-button').onclick = () => dialog.close();
  let drafts = []; let busy = false;
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const preview = dialog.querySelector('#preview-import'); preview.disabled = true;
    try {
      const value = await api('import/preview', 'POST', { text: dialog.querySelector('#paste-postings').value }); drafts = value.drafts;
      dialog.querySelector('#import-preview').innerHTML = drafts.map((d, i) => `<section class="import-draft" data-draft="${i}"><h3>岗位 ${i + 1} · 请确认名称</h3><div class="field-grid">${[['title','岗位名称'],['company','公司'],['location','地点'],['salary','薪资'],['url','来源链接']].map(([k,label]) => `<label>${label}<input data-field="${k}" value="${esc(d[k])}" ${k === 'title' ? 'required' : ''} ${k === 'url' ? 'type="url"' : ''}></label>`).join('')}</div><details><summary>检查归档原文（可修正）</summary><textarea data-field="posting" rows="6" required>${esc(d.posting)}</textarea></details><p data-result class="form-help"></p></section>`).join('');
      dialog.querySelector('#save-import').hidden = false; dialog.querySelector('#import-error').textContent = '';
    } catch (error) { dialog.querySelector('#import-error').textContent = error.message; }
    finally { busy = false; preview.disabled = false; }
  };
  dialog.querySelector('#paste-postings').oninput = () => { if (!busy) { drafts = []; dialog.querySelector('#import-preview').innerHTML = ''; dialog.querySelector('#save-import').hidden = true; } };
  dialog.querySelector('#save-import').onclick = async () => {
    if (busy) return; busy = true; const save = dialog.querySelector('#save-import'); save.disabled = true; dialog.querySelector('#preview-import').disabled = true;
    let saved = 0;
    for (let i = 0; i < drafts.length; i++) {
      const section = dialog.querySelector(`[data-draft="${i}"]`); if (drafts[i].saved) continue;
      const data = Object.fromEntries([...section.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el.value]));
      try { const job = await api('jobs', 'POST', data); drafts[i].saved = job.id; saved++; section.querySelector('[data-result]').textContent = '✓ 已归档'; section.querySelectorAll('input,textarea').forEach(el => { el.disabled = true; }); }
      catch (error) { section.querySelector('[data-result]').textContent = `未保存：${error.message}`; }
    }
    busy = false; save.disabled = false; dialog.querySelector('#preview-import').disabled = false;
    if (saved) await onSaved();
    if (drafts.every(d => d.saved)) dialog.close();
    else dialog.querySelector('#import-error').textContent = '部分岗位未保存，请修正对应内容后再次确认；已成功的岗位不会重复提交。';
  };
}
