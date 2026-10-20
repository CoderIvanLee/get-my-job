import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStore, WorkspaceError, statuses } from '../../tools/workspace/store.mjs';
import { parsePostings } from '../../tools/workspace/import.mjs';

const publicRoot = new URL('./public/', import.meta.url);
const defaultRoot = fileURLToPath(new URL('../../workspace-data/', import.meta.url));
export function createApp(dataRoot = process.env.JOB_WORKSPACE_DIR || defaultRoot) {
  const store = createStore(dataRoot);
  const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/import-ui.js': ['import-ui.js', 'text/javascript; charset=utf-8'], '/growth-ui.js': ['growth-ui.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
  async function body(req) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new WorkspaceError('请发送 application/json');
    let bytes = 0; const chunks = [];
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new WorkspaceError('请求超过 1 MiB', 'TOO_LARGE', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new WorkspaceError('JSON 格式错误'); }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const port = req.socket.localPort;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) return send(403, { error: '只允许本地访问', code: 'FORBIDDEN_HOST' });
      if ((req.headers.origin && !allowedHosts.map(h => `http://${h}`).includes(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '不允许跨站访问', code: 'FORBIDDEN_ORIGIN' });
      const path = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path]; const content = await readFile(new URL(file, publicRoot));
        res.writeHead(200, { 'Content-Type': type }); res.end(content); return;
      }
      let value;
      if (path === '/api/import/preview' && req.method === 'POST') return send(200, { drafts: parsePostings((await body(req))?.text) });
      if (path === '/api/growth/prepare' && req.method === 'POST') return send(200, await store.prepareGrowth(await body(req)));
      if (path === '/api/growth/generate' && req.method === 'POST') return send(201, await store.generateGrowth(await body(req)));
      if (path === '/api/growth/plans' && req.method === 'GET') return send(200, await store.listPlans());
      if (path === '/api/meta' && req.method === 'GET') value = { statuses, mode: 'local', stage: 2, features: ['paste-import', 'growth-plans'] };
      else if (path === '/api/profile' && req.method === 'GET') value = await store.getProfile();
      else if (path === '/api/profile' && req.method === 'PUT') value = await store.saveProfile(await body(req));
      else if (path === '/api/jobs' && req.method === 'GET') value = await store.listJobs();
      else if (path === '/api/jobs' && req.method === 'POST') { value = await store.createJob(await body(req)); return send(201, value); }
      else if (/^\/api\/jobs\/[^/]+$/.test(path) && ['GET', 'PUT'].includes(req.method)) {
        const id = path.split('/').at(-1);
        value = req.method === 'GET' ? await store.getJob(id) : await store.updateJob(id, await body(req));
      }
      else if (path === '/api/settings' && req.method === 'GET') value = await store.getSettings();
      else if (path === '/api/settings' && req.method === 'PUT') value = await store.saveSettings(await body(req));
      else if (path === '/api/export' && req.method === 'GET') {
        value = await store.exportData(); res.setHeader('Content-Disposition', 'attachment; filename="job-workspace-export.json"');
      }
      else return send(404, { error: '找不到这个资源', code: 'NOT_FOUND' });
      send(200, value);
    } catch (error) {
      const known = error instanceof WorkspaceError;
      if (!known) console.error('Workspace request failed:', error.code || error.name);
      if (!res.headersSent) send(known ? error.status : 500, { error: known ? error.message : '本地资料操作失败，请检查目录权限', code: known ? error.code : 'INTERNAL_ERROR' });
      else res.end();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT 必须在 1 到 65535 之间'); process.exit(1); }
  const server = createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，请设置 PORT 使用其他端口。` : `启动失败：${error.code}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`求职工作台已启动：http://127.0.0.1:${port}\n本地单用户模式；按 Ctrl+C 停止。`));
}
