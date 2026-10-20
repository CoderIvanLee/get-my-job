import { mkdir, readFile, writeFile, rename, rm, lstat, readdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateRequest, validatePlan, buildPrompt, requestPlan } from './growth.mjs';

export const statuses = ['收藏', '准备中', '已投递', '面试中', '收到 offer', '已拒绝', '已关闭'];
export const profileFields = ['name', 'city', 'targetRole', 'expectedSalary', 'summary', 'experience', 'education', 'skills', 'links'];
const jobFields = ['title', 'company', 'location', 'salary', 'url', 'posting', 'notes', 'status'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class WorkspaceError extends Error {
  constructor(message, code = 'INVALID_INPUT', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message, code, status) => { throw new WorkspaceError(message, code, status); };
const object = (value) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('需要 JSON 对象'); };
function textFields(input, fields) {
  object(input);
  const out = {};
  for (const field of fields) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'string') fail(`${field} 必须是文本`);
    if (input[field].length > 100000) fail(`${field} 内容过长`);
    out[field] = input[field].trim();
  }
  return out;
}
function webUrl(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { fail('链接必须是完整的 http 或 https URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('链接必须是无账号密码的 http 或 https URL');
  url.hash = '';
  return url.href;
}
export function createStore(dataRoot) {
  const root = resolve(dataRoot);
  async function init() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink()) fail('资料目录不能是符号链接');
    await safeDirectory(join(root, 'jobs'));
  }
  async function safeDirectory(dir) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const st = await lstat(dir);
    if (st.isSymbolicLink() || !st.isDirectory() || !(await realpath(dir)).startsWith((await realpath(root)) + '/')) fail('资料路径不安全');
  }
  async function read(file, fallback) {
    try {
      if ((await lstat(file)).isSymbolicLink()) fail('不允许读取符号链接资料');
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      if (error instanceof SyntaxError) fail(`资料文件格式错误，请修复后重试：${file}`, 'CORRUPT_DATA', 422);
      throw error;
    }
  }
  async function atomic(file, value) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await rename(temp, file);
    } finally { await rm(temp, { force: true }); }
  }
  async function locked(fn) {
    await init();
    const lock = join(root, '.write-lock');
    let acquired = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(r => setTimeout(r, 25)); }
    }
    if (!acquired) fail('资料正在写入。若进程异常退出，请确认没有运行中的写入后删除 .write-lock 目录。', 'BUSY', 409);
    try { return await fn(); } finally { await rm(lock, { recursive: true, force: true }); }
  }
  function checkVersion(input, current) {
    if (!Number.isInteger(input.version) || input.version !== current.version) fail('资料已被其他窗口或 Skill 更新，请刷新后重试。', 'CONFLICT', 409);
  }
  async function jobPath(id) {
    if (!uuid.test(id)) fail('无效的岗位 ID');
    const dir = join(root, 'jobs', id);
    try { if ((await lstat(dir)).isSymbolicLink()) fail('不允许读取符号链接岗位'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return join(dir, 'job.json');
  }
  async function getJob(id) {
    await init();
    const value = await read(await jobPath(id), null);
    if (!value) fail('找不到这个岗位', 'NOT_FOUND', 404);
    if (value.id !== id || !Number.isInteger(value.version) || value.version < 1 || !statuses.includes(value.status) || jobFields.some(key => typeof value[key] !== 'string') || ['createdAt', 'updatedAt'].some(key => typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])))) fail(`岗位资料结构错误，请检查：${join(root, 'jobs', id, 'job.json')}`, 'CORRUPT_DATA', 422);
    return value;
  }
  async function listJobs() {
    await init();
    const entries = await readdir(join(root, 'jobs'), { withFileTypes: true });
    const jobs = [];
    for (const entry of entries) {
      if (uuid.test(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) jobs.push(await getJob(entry.name));
    }
    return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function getProfile() {
    await init();
    const value = await read(join(root, 'profile.json'), { version: 0, ...Object.fromEntries(profileFields.map(k => [k, ''])) });
    if (!value || !Number.isInteger(value.version) || profileFields.some(k => typeof value[k] !== 'string')) fail('档案结构错误，请检查 profile.json', 'CORRUPT_DATA', 422);
    return value;
  }
  async function getSecretSettings() {
    await init();
    const value = await read(join(root, 'model-settings.json'), { version: 0, baseUrl: '', model: '', apiKey: '' });
    if (!value || !Number.isInteger(value.version) || ['baseUrl', 'model', 'apiKey'].some(k => typeof value[k] !== 'string')) fail('模型设置格式错误', 'CORRUPT_DATA', 422);
    return value;
  }
  async function growthContext(input) {
    validateRequest(input);
    const jobs = await Promise.all(input.jobIds.map(getJob));
    const profile = await getProfile();
    const context = { profile, jobs: jobs.map(({ id, version, title, company, posting }) => ({ id, version, title, company, posting })), weeks: input.weeks, hoursPerWeek: input.hoursPerWeek };
    if (JSON.stringify(context).length > 180000) fail('岗位内容过长，请减少所选岗位或缩短描述');
    return context;
  }
  async function listPlans() {
    await init(); await safeDirectory(join(root, 'plans'));
    const entries = await readdir(join(root, 'plans'));
    const plans = [];
    for (const name of entries.filter(n => uuid.test(n.replace(/\.json$/, '')) && n.endsWith('.json'))) {
      const plan = await read(join(root, 'plans', name), null);
      try {
        if (!plan || typeof plan.source !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) || !Array.isArray(plan.context?.jobs) || plan.context.jobs.some(j => !uuid.test(j.id) || typeof j.posting !== 'string' || typeof j.title !== 'string')) throw new Error();
        validateRequest({ ...plan.context, jobIds: plan.context.jobs.map(j => j.id) });
        plan.result = validatePlan(plan.result, plan.context);
      } catch { fail(`计划资料损坏：${join(root, 'plans', name)}`, 'CORRUPT_DATA', 422); }
      plans.push(plan);
    }
    return plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function savePlan(context, result, source) {
    return locked(async () => {
      await safeDirectory(join(root, 'plans'));
      const value = { id: randomUUID(), createdAt: new Date().toISOString(), source, context, result: validatePlan(result, context) };
      await atomic(join(root, 'plans', `${value.id}.json`), value); return value;
    });
  }
  return {
    root, init, getJob, listJobs, getProfile, listPlans,
    async prepareGrowth(input) {
      const context = await growthContext(input); const settings = await getSecretSettings();
      return { context, prompt: buildPrompt(context), target: { baseUrl: settings.baseUrl, model: settings.model, settingsVersion: settings.version } };
    },
    async generateGrowth(input) {
      if (input?.consent !== true) fail('请先确认将档案和所选岗位发送给模型服务');
      const context = await growthContext(input); const settings = await getSecretSettings();
      if (JSON.stringify(context) !== JSON.stringify(input.expectedContext) || settings.version !== input.settingsVersion) fail('岗位、档案或模型配置已变化，请重新预览后生成。', 'CONFLICT', 409);
      return savePlan(context, await requestPlan(settings, context), `model:${settings.model}`);
    },
    async importGrowth(input) {
      const context = await growthContext(input);
      if (JSON.stringify(context) !== JSON.stringify(input.expectedContext)) fail('档案或岗位已变化，请重新导出分析任务，或传入该任务原始 expectedContext。', 'CONFLICT', 409);
      return savePlan(context, input.plan, 'skill');
    },
    saveProfile: input => locked(async () => {
      object(input); const current = await getProfile(); checkVersion(input, current);
      const value = { ...current, ...textFields(input, profileFields), version: current.version + 1, updatedAt: new Date().toISOString() };
      await atomic(join(root, 'profile.json'), value); return value;
    }),
    createJob: input => locked(async () => {
      const fields = textFields(input, jobFields);
      if (!fields.title || !fields.posting) fail('请填写岗位名称和完整职位描述');
      fields.url = webUrl(fields.url);
      if (fields.url && (await listJobs()).some(j => j.url === fields.url)) fail('这个链接已收藏，请打开已有岗位进行更新', 'DUPLICATE_URL', 409);
      if (fields.status && !statuses.includes(fields.status)) fail('无效的岗位状态');
      const id = randomUUID(); const now = new Date().toISOString();
      const value = { ...Object.fromEntries(jobFields.map(k => [k, ''])), ...fields, originalPosting: fields.posting, id, status: fields.status || '收藏', version: 1, createdAt: now, updatedAt: now, postedDate: null };
      const staging = join(root, 'jobs', `.pending-${id}`);
      try {
        await safeDirectory(staging);
        await atomic(join(staging, 'job.json'), value);
        await rename(staging, join(root, 'jobs', id));
      } finally { await rm(staging, { recursive: true, force: true }); }
      return value;
    }),
    updateJob: (id, input) => locked(async () => {
      object(input); const current = await getJob(id); checkVersion(input, current);
      const fields = textFields(input, jobFields);
      if (fields.title === '' || fields.posting === '') fail('岗位名称和职位描述不能为空');
      if (fields.status !== undefined && !statuses.includes(fields.status)) fail('无效的岗位状态');
      if (fields.url !== undefined) {
        fields.url = webUrl(fields.url);
        if (fields.url && (await listJobs()).some(j => j.id !== id && j.url === fields.url)) fail('这个链接已收藏', 'DUPLICATE_URL', 409);
      }
      const value = { ...current, ...fields, originalPosting: current.originalPosting ?? current.posting, version: current.version + 1, updatedAt: new Date().toISOString() };
      await atomic(await jobPath(id), value); return value;
    }),
    async getSettings() {
      const { apiKey, ...rest } = await getSecretSettings();
      return { ...rest, hasKey: !!apiKey, keyHint: apiKey ? '••••••••' : '' };
    },
    saveSettings: input => locked(async () => {
      object(input); const current = await getSecretSettings(); checkVersion(input, current);
      const fields = textFields(input, ['baseUrl', 'model', 'apiKey']);
      if (fields.baseUrl !== undefined) fields.baseUrl = webUrl(fields.baseUrl);
      const apiKey = input.clearKey === true ? '' : fields.apiKey || current.apiKey;
      const value = { ...current, ...fields, apiKey, version: current.version + 1 };
      await atomic(join(root, 'model-settings.json'), value);
      const { apiKey: ignored, ...rest } = value;
      return { ...rest, hasKey: !!apiKey, keyHint: apiKey ? '••••••••' : '' };
    }),
    async exportData() { return locked(async () => ({ schemaVersion: 2, exportedAt: new Date().toISOString(), profile: await getProfile(), jobs: await listJobs(), plans: await listPlans() })); },
  };
}
