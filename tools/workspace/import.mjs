import { WorkspaceError } from './store.mjs';
export function parsePostings(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 500000) throw new WorkspaceError('请粘贴职位原文（最多 50 万字）');
  const chunks = text.replace(/\r\n?/g, '\n').split(/^\s*---+\s*$/m).map(s => s.trim()).filter(Boolean);
  if (chunks.length > 20) throw new WorkspaceError('一次最多导入 20 个岗位，请分批粘贴');
  return chunks.map(posting => {
    const lines = posting.split('\n').map(s => s.trim()).filter(Boolean);
    const tagged = (labels) => lines.map(s => s.match(new RegExp(`^(?:${labels})\\s*[：:]\\s*(.+)$`))).find(Boolean)?.[1] || '';
    const url = lines.map(s => s.match(/^https?:\/\/[^\s]+$/)?.[0]).find(Boolean) || tagged('职位链接|来源链接|链接');
    return { title: (tagged('职位名称|岗位名称|职位|岗位') || lines[0]).slice(0, 200), company: tagged('公司名称|公司|企业'), location: tagged('工作地点|地点|城市'), salary: tagged('薪资|薪资范围|薪酬'), url, posting, notes: '' };
  });
}
