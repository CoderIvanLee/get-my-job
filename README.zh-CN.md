# 向职 · 本地求职工作台

基于 [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) 的中国本土化适配。原项目采用 MIT 许可证，本仓库保留原作者和许可声明。

中文网站与 Codex Skill 共用本地档案和岗位资料。现已支持粘贴批量导入、跨岗位能力分析与学习成长计划。语音面试、项目进度管理和浏览器插件尚未实现。

## 启动

需要 Node.js 22 或更新版本。本地网站无第三方运行依赖，无需 npm install、数据库、Bun、模型 Key 或 LaTeX。

```bash
cd /你的路径/ai-job-search
npm start
```

打开 <http://127.0.0.1:3210>。停止时在终端按 Ctrl+C。端口占用时使用 `PORT=3211 npm start`。默认只监听 `127.0.0.1`，用于本机单用户访问；没有公网账号和多人资料隔离。

## 使用

1. 在「我的档案」填写真实背景、技能、教育和项目证据。
2. 在「意向岗位」点击「粘贴导入职位」，粘贴完整职位描述后提取预览，确认名称即可归档。多个岗位用单独一行 `---` 分隔；公司、地点、薪资可选。链接不会自动抓取。
3. 搜索岗位、公司或地点，按申请状态筛选。点击卡片编辑原文、备注与申请状态。
4. 在「连接 Skill」查看如何通过 Codex 继续分析。
5. 在「模型设置」保存兼容 chat/completions 的 API 根地址（例如 `https://服务商/v1`）、模型名与自己的 API Key。网站成长计划使用此配置；Codex 自身仍使用 Codex 的模型配置。远程服务需 HTTPS，本机服务可 HTTP。
6. 通过模型设置或 Skill 页面导出资料，备份文件包含个人档案和岗位原文，请自行妥善保存。

目前只支持粘贴文本，简历 PDF 上传解析不在此版本内。岗位发布日期未知时保持空值，不将收藏日期当作发布日期。

## 数据与备份

默认资料保存在仓库根目录的 `workspace-data/`，已加入 Git 忽略。岗位原文保存在对应 `jobs/<id>/job.json` 的 `posting` 字段，和岗位信息一起原子写入，避免两份文件不同步。档案是 `profile.json`。

可以指定目录，网站和 Skill 命令必须使用同一个路径：

```bash
JOB_WORKSPACE_DIR=/你的绝对路径/求职资料 npm start
JOB_WORKSPACE_DIR=/你的绝对路径/求职资料 node tools/workspace/cli.mjs jobs
```

**自定义目录不要放进其他公开 Git 仓库**，本仓库 `.gitignore` 只能保护默认资料目录。默认目录下的 `model-settings.json` 包含明文模型密钥，文件权限为仅当前用户读写；它不会被 API 返回或资料导出包含。不要分享完整资料目录。若需完整恢复，可在服务停止时将目录备份到你自己安全的位置。JSON 导出当前用于查看和备份，没有网站内自动恢复入口。

资料版本冲突时先保留未保存的文本，再刷新后编辑。若手工改坏 JSON，网站和 CLI 会提示格式错误而不会覆盖。写入进程异常结束可能留下 `.write-lock` 目录；确认网站和所有 CLI 写入进程已停止后再删除该空锁目录。

## 在 Codex 中使用

从此仓库打开 Codex，新会话可以发现 `.agents/skills/cn-local-workspace/`。若没有自动发现，可直接输入：

> 请读取 .agents/skills/cn-local-workspace/SKILL.md，查看我的真实档案和收藏的岗位，按照仓库规范分析一个岗位的匹配点和差距。

规范只维护在 `.claude/skills/cn-local-workspace/SKILL.md`，`.agents/` 文件是入口指针。网站资料不会自动同步到原 `CLAUDE.md` 或上游的个人档案模板；中文 Skill 将共享资料工具读出的事实作为依据，避免使用占位符生成经历。

命令行读取：

```bash
node tools/workspace/cli.mjs profile
node tools/workspace/cli.mjs jobs
node tools/workspace/cli.mjs job <岗位ID>
node tools/workspace/cli.mjs export
```

写入使用标准输入 JSON：

```bash
node tools/workspace/cli.mjs add-job <<'JSON'
{"title":"AI 产品经理","company":"示例公司","posting":"粘贴真实岗位原文","location":"上海","salary":"以岗位原文为准"}
JSON
```

更新须先读取当前记录的 `version`：

```bash
node tools/workspace/cli.mjs update-job <岗位ID> <<'JSON'
{"version":1,"status":"准备中","notes":"补充真实项目演示后投递"}
JSON
```

`save-profile` 采用相同的版本检查。CLI 和网站共用模块，写入后刷新网页即可看到结果。CLI 不提供 Key 读取命令。

## 成本与资料发送

粘贴预览和资料管理不调用外部服务。「学习成长」仅在你确认预览内容和目标服务并点击生成后，发送档案与选中的岗位原文给配置的模型。网站不会自动收集岗位或发送申请。使用 Codex 或其他模型工具时，工具会将其读取的资料发送给你配置的模型服务，请按需求提供资料。自带 Key 免项目平台调用费，模型服务商可能收费。不同文本、语音服务不保证共享 Key。

## 开发与验证

```bash
npm run test:workspace
```

检查资料往返、CLI 与 HTTP 共用存储、并发版本冲突、损坏文件保护、路径限制、密钥掩码与跨站拒绝。测试使用临时资料，不更改你的档案。HTTP 检查需要允许监听本地回环端口。

完整规划见 `docs/superpowers/specs/2026-10-20-cn-job-workspace-design.md`，原项目功能与依赖说明保留在 `README.md`、`SETUP.md`。

## 跨岗位能力与学习计划

1. 在「学习成长」勾选 2–10 个岗位，指定 1–12 周与每周 1–40 小时。
2. 点击「预览分析任务」，核对完整发送资料、模型地址和模型名称。
3. 配置模型后，勾选同意并生成。模型响应必须包含可在原岗位找到的引用，以及每周任务、实际交付物和验收条件。引用失实或格式不完整时不保存。
4. 无 API Key 时，导出任务交给 Codex。下载文件含个人资料，需妥善保存。

网站按被引用的不同岗位计算需求频次，这是所选样本的频次，不代表整个招聘市场。计划是模型建议，不证明用户已经掌握技能。模型没有联网检索能力，不会自动推荐未经核实的课程链接。

计划保存在 `workspace-data/plans/`，包含生成时的档案和岗位快照。岗位的 `originalPosting` 保留首次导入内容；对于升级前的记录，首次编辑时保存当时仍可取得的内容，无法恢复此前已覆盖的原文。

Skill 可用以下命令读取和保存计划：

```bash
node tools/workspace/cli.mjs plans
node tools/workspace/cli.mjs growth-task < request.json
node tools/workspace/cli.mjs save-growth < result.json
```

request.json 包含 `jobIds`（2–10 个 ID）、`weeks` 和 `hoursPerWeek`；result.json 使用相同请求字段，并添加 `plan` 以及原导出任务的 `context`（字段名 `expectedContext`）。plan 格式见导出任务中的 JSON 要求。保存时重新依据当前岗位校验引用；如果期间改过原文，请先重新读取资料。

模型网关使用标准 chat/completions 文本请求；提供商必须支持 JSON 文本输出和该协议。本版本以本地模拟模型验证链路，实际效果和兼容性依赖你配置的服务。
