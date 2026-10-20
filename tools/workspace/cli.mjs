#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore, WorkspaceError } from './store.mjs';
export const defaultRoot = fileURLToPath(new URL('../../workspace-data/', import.meta.url));
const store = createStore(process.env.JOB_WORKSPACE_DIR || defaultRoot);
const [command, id] = process.argv.slice(2);
async function input() {
  let data = '';
  for await (const chunk of process.stdin) { data += chunk; if (data.length > 1024 * 1024) throw new WorkspaceError('输入超过 1 MiB'); }
  try { return JSON.parse(data); } catch { throw new WorkspaceError('请通过标准输入提供 JSON 对象'); }
}
async function main() {
  switch (command) {
    case 'profile': return store.getProfile();
    case 'save-profile': return store.saveProfile(await input());
    case 'jobs': return store.listJobs();
    case 'job': return store.getJob(id || '');
    case 'add-job': return store.createJob(await input());
    case 'update-job': return store.updateJob(id || '', await input());
    case 'export': return store.exportData();
    case 'growth-task': return store.prepareGrowth(await input());
    case 'save-growth': return store.importGrowth(await input());
    case 'plans': return store.listPlans();
    default: throw new WorkspaceError('用法：node tools/workspace/cli.mjs profile|save-profile|jobs|job <id>|add-job|update-job <id>|export|plans|growth-task|save-growth。写入命令通过 stdin 接收 JSON；更新须传 version。');
  }
}
// Avoid executing commands if imported by another module.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: error instanceof WorkspaceError ? error.message : '资料操作失败，请检查目录权限', code: error.code || 'FAILED' }) + '\n');
    process.exitCode = 1;
  });
}
