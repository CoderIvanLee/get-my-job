import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePostings } from '../tools/workspace/import.mjs';
import { validatePlan, requestPlan } from '../tools/workspace/growth.mjs';
import { createStore } from '../tools/workspace/store.mjs';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'growth-check-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createStore(root);
  const a = await store.createJob({ title: 'AI 开发', posting: '熟悉 Python，能够完成真实项目。' });
  const b = await store.createJob({ title: 'AI 应用', posting: '要求 Python 和模型 API 使用经验。' });
  return { store, a, b, input: { jobIds: [a.id, b.id], weeks: 1, hoursPerWeek: 6 } };
}
function result(context) { return { summary: '先完成可演示的 Python 小项目。', skills: [{ name: 'Python', gap: '档案尚无证据，需要确认基础。', evidence: context.jobs.map(j => ({ jobId: j.id, quote: 'Python' })) }], weeks: [{ week: 1, goal: '完成实际应用', tasks: ['编写一个模型 API 调用工具并记录错误案例'], deliverable: '代码与演示', acceptance: '用五个案例检查输出与失败处理' }] }; }
test('paste parser handles batch, labels and missing fields without fabricated metadata', () => {
  const drafts = parsePostings('岗位：AI 开发\n公司：示例\n地点：上海\n薪资：20K\n要求 Python\n---\nAI 产品经理\n负责产品方案');
  assert.equal(drafts.length, 2); assert.equal(drafts[0].title, 'AI 开发'); assert.equal(drafts[0].company, '示例'); assert.equal(drafts[1].company, ''); assert.match(drafts[0].posting, /要求 Python/);
  assert.throws(() => parsePostings('  ')); assert.throws(() => parsePostings(Array(21).fill('岗位').join('\n---\n')));
});
test('original posting survives edits and grows into a persistent evidence-backed plan', async t => {
  const { store, a, input } = await fixture(t); const prepared = await store.prepareGrowth(input);
  const plan = await store.importGrowth({ ...input, expectedContext: prepared.context, plan: result(prepared.context) });
  assert.equal(plan.result.skills[0].jobCount, 2);
  const edited = await store.updateJob(a.id, { version: 1, posting: '岗位已下架，后续记录' });
  assert.equal(edited.originalPosting, a.posting);
  const archived = (await store.listPlans())[0]; assert.equal(archived.context.jobs[0].posting, a.posting);
  assert.equal((await store.exportData()).plans[0].id, plan.id);
});
test('rejects forged evidence, wrong week coverage and stale send consent', async t => {
  const { store, a, input } = await fixture(t); const prepared = await store.prepareGrowth(input);
  const forged = result(prepared.context); forged.skills[0].evidence[0].quote = '不存在的要求';
  assert.throws(() => validatePlan(forged, prepared.context), /引用/);
  const missing = result(prepared.context); missing.weeks = []; assert.throws(() => validatePlan(missing, prepared.context));
  await assert.rejects(store.prepareGrowth({ ...input, jobIds: [a.id] }), /2–10/);
  await assert.rejects(store.generateGrowth({ ...input, consent: false }), /确认/);
  await store.updateJob(a.id, { version: 1, notes: 'updated' });
  await assert.rejects(store.generateGrowth({ ...input, expectedContext: prepared.context, settingsVersion: 0, consent: true }), { code: 'CONFLICT' });
  assert.equal((await store.listPlans()).length, 0);
});
test('configured model integration uses explicit consent, decodes Chinese and never exports key', async t => {
  const { store, input } = await fixture(t); let requests = 0;
  const server = http.createServer(async (req, res) => {
    requests++; assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, 'Bearer disposable-key');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw); const context = JSON.parse(payload.messages[1].content);
    assert.ok(!raw.includes('disposable-key'));
    res.setHeader('Content-Type', 'application/json');
    const encoded = Buffer.from(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result(context)) } }] }));
    res.write(encoded.subarray(0, 100)); res.end(encoded.subarray(100));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  await store.saveSettings({ version: 0, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'mock', apiKey: 'disposable-key' });
  const prepared = await store.prepareGrowth(input);
  assert.ok(!JSON.stringify(prepared).includes('disposable-key'));
  const plan = await store.generateGrowth({ ...input, consent: true, expectedContext: prepared.context, settingsVersion: prepared.target.settingsVersion });
  assert.equal(plan.result.skills[0].name, 'Python'); assert.equal(requests, 1);
  assert.ok(!JSON.stringify(await store.exportData()).includes('disposable-key'));
});
test('model failures are clear, do not reveal server response, and require secure remote endpoint', async t => {
  const { store, input } = await fixture(t); const { context } = await store.prepareGrowth(input);
  await assert.rejects(requestPlan({ baseUrl: 'https://example.com/v1', model: 'mock', apiKey: 'secret' }, context, async () => new Response('private error', { status: 401 })), error => error.code === 'MODEL_FAILED' && !error.message.includes('private'));
  await assert.rejects(requestPlan({ baseUrl: 'http://remote.example/v1', model: 'mock', apiKey: 'secret' }, context), /HTTPS/);
  await assert.rejects(requestPlan({}, context), { code: 'MISSING_CREDENTIALS' });
});
test('Skill import rejects a plan based on an older profile snapshot', async t => {
  const { store, input } = await fixture(t); const task = await store.prepareGrowth(input);
  await store.saveProfile({ version: 0, skills: '已完成 Python 项目' });
  await assert.rejects(store.importGrowth({ ...input, expectedContext: task.context, plan: result(task.context) }), { code: 'CONFLICT' });
  assert.deepEqual(await store.listPlans(), []);
});
