import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { createStore } from '../tools/workspace/store.mjs';
import { createApp } from '../apps/web/server.mjs';
const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'job-workspace-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createStore(root) };
}
const posting = { title: 'AI 应用工程师', company: '示例公司', posting: '使用模型构建业务工具，要求有真实项目。', url: 'https://example.com/job/1' };
test('CLI and HTTP share persisted Chinese profile, jobs, status and export', async t => {
  const { root } = await fixture(t); const server = createApp(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', data) => fetch(url + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const create = await call('/api/jobs', 'POST', posting); assert.equal(create.status, 201);
  const job = await create.json(); assert.equal(job.status, '收藏');
  const env = { ...process.env, JOB_WORKSPACE_DIR: root };
  const cli = await exec(process.execPath, ['tools/workspace/cli.mjs', 'jobs'], { env });
  assert.equal(JSON.parse(cli.stdout)[0].id, job.id);
  const p = await (await call('/api/profile')).json();
  assert.equal((await call('/api/profile', 'PUT', { ...p, name: '测试用户', skills: 'Python' })).status, 200);
  assert.equal(JSON.parse((await exec(process.execPath, ['tools/workspace/cli.mjs', 'profile'], { env })).stdout).name, '测试用户');
  const changed = await (await call(`/api/jobs/${job.id}`, 'PUT', { version: job.version, status: '面试中' })).json();
  assert.equal(changed.version, 2);
  const newStore = createStore(root); assert.equal((await newStore.getJob(job.id)).status, '面试中');
  const exported = await (await call('/api/export')).json(); assert.equal(exported.jobs[0].posting, posting.posting);
  const page = await call('/'); assert.equal(page.status, 200); assert.match(await page.text(), /向职/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await call('/tools/workspace/store.mjs')).status, 404);
  assert.equal((await call('/api/jobs/not-an-id')).status, 400);
  assert.equal((await call('/api/jobs', 'POST', { title: '无描述' })).status, 400);
  const foreign = await fetch(url + '/api/jobs', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify(posting) });
  assert.equal(foreign.status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http.get(url + '/api/export', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
});
test('stale concurrent edits conflict instead of overwriting', async t => {
  const { root, store } = await fixture(t); const job = await store.createJob(posting);
  const results = await Promise.allSettled([store.updateJob(job.id, { version: 1, notes: '窗口 A' }), createStore(root).updateJob(job.id, { version: 1, notes: 'Skill B' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal((await store.getJob(job.id)).version, 2);
});
test('invalid user edits and symbolic links are rejected without changing files', async t => {
  const { root, store } = await fixture(t); await store.init();
  const broken = '{"name":'; await writeFile(join(root, 'profile.json'), broken);
  await assert.rejects(store.saveProfile({ version: 0, name: 'replacement' }), { code: 'CORRUPT_DATA' });
  assert.equal(await readFile(join(root, 'profile.json'), 'utf8'), broken);
  const target = join(root, 'outside'); await mkdir(target); const id = '01234567-1234-4567-89ab-012345678901';
  await symlink(target, join(root, 'jobs', id));
  await assert.rejects(store.getJob(id), /符号链接/);
  await assert.rejects(store.getJob('../../profile'), /无效/);
});
test('duplicates, invalid status, unsafe URLs and invalid field types are rejected', async t => {
  const { store } = await fixture(t); const job = await store.createJob(posting);
  await assert.rejects(store.createJob({ ...posting, url: posting.url + '#x' }), { code: 'DUPLICATE_URL' });
  await assert.rejects(store.updateJob(job.id, { version: 1, status: '未知状态' }), /状态/);
  await assert.rejects(store.createJob({ ...posting, url: 'javascript:alert(1)' }), /http/);
  await assert.rejects(store.createJob({ ...posting, url: 'https://user:secret@example.com/' }), /账号密码/);
  await assert.rejects(store.saveProfile({ version: 0, name: ['wrong'] }), /文本/);
  await assert.rejects(store.createJob(null), /JSON 对象/);
});
test('settings mask keys, preserve blank key updates, exclude secrets from export, and allow clearing', async t => {
  const { root, store } = await fixture(t);
  const secret = 'test-secret-not-a-real-key';
  const saved = await store.saveSettings({ version: 0, baseUrl: 'https://example.com/v1', model: 'example', apiKey: secret });
  assert.equal(saved.hasKey, true); assert.equal(saved.apiKey, undefined);
  assert.ok(!JSON.stringify(saved).includes(secret));
  await store.saveSettings({ version: saved.version, apiKey: '', model: 'next' });
  assert.equal(JSON.parse(await readFile(join(root, 'model-settings.json'), 'utf8')).apiKey, secret);
  assert.equal((await stat(join(root, 'model-settings.json'))).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(await store.exportData()).includes(secret));
  assert.ok(!JSON.stringify(await store.getSettings()).includes(secret));
  const cleared = await store.saveSettings({ version: 2, clearKey: true }); assert.equal(cleared.hasKey, false);
});
test('invalid persisted job fields fail with the file path instead of breaking rendering', async t => {
  const { root, store } = await fixture(t); const job = await store.createJob(posting);
  const file = join(root, 'jobs', job.id, 'job.json');
  await writeFile(file, JSON.stringify({ ...job, company: 123 }));
  await assert.rejects(store.listJobs(), error => error.code === 'CORRUPT_DATA' && error.message.includes(file));
  await writeFile(file, JSON.stringify({ ...job, updatedAt: null }));
  await assert.rejects(store.listJobs(), { code: 'CORRUPT_DATA' });
});
test('unpublished job staging directories do not break readers', async t => {
  const { root, store } = await fixture(t); await store.init();
  await mkdir(join(root, 'jobs', '.pending-01234567-1234-4567-89ab-012345678901'));
  assert.deepEqual(await store.listJobs(), []);
  const writes = Array.from({ length: 5 }, (_, i) => store.createJob({ ...posting, url: '', title: `岗位 ${i}` }));
  const reads = Array.from({ length: 10 }, () => store.listJobs());
  await Promise.all([...writes, ...reads]);
  assert.equal((await store.listJobs()).length, 5);
});
