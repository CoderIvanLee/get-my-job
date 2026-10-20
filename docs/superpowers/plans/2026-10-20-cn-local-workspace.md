# Chinese Local Workspace Implementation Plan

> **For agentic workers:** Execute inline, task by task, with verification below. User requested continuous completion and notification.

**Goal:** Deliver stage one of the approved local Chinese job workspace.

**Architecture:** A Node.js localhost HTTP server and a CLI share a file store. A browser interface edits the same versioned records. Canonical Chinese workflow rules live under `.claude/`; portable Skill entry points reference them.

**Tech Stack:** Node.js 22+, native ES modules, HTML/CSS/browser JavaScript; zero external runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-cn-job-workspace-design.md`

## Global Constraints

- Local single user; server listens on 127.0.0.1 only.
- No Key required for records; no simulated AI features.
- Chinese UI; preserve upstream license and workflow source of truth.
- Personal files are ignored; exports exclude model secrets.
- Speech, plugin, AI analysis and project coaching remain subsequent stages.

## Review Focus

- Simultaneous CLI and browser edits return a version conflict, not lost work.
- Invalid user-edited JSON is reported without replacement.
- Unknown IDs, traversal and symlink records cannot read outside the data root.
- Model keys are masked, not returned by API or export.
- Foreign browser origins cannot change records.

### Task 1: Shared store and CLI

Files: `tools/workspace/store.mjs`, `tools/workspace/cli.mjs`, `tests/workspace.test.mjs`, `.gitignore`.

Interfaces: `createStore(root)` returns profile read/write, job list/get/create/update, settings get/write, and export methods. Updates require `version`; creation uses UUIDs. CLI commands use JSON stdin for mutations and JSON stdout for results.

- [x] Implement atomic writes, a cross-process lock, field validation, version conflicts and duplicate source URL detection.
- [x] Exercise persistence, concurrent updates, malformed data, invalid paths and secret exclusion with Node's test runner.

### Task 2: Local server and browser UI

Files: `apps/web/server.mjs`, `apps/web/public/{index.html,app.js,style.css}`, root `package.json`.

Interfaces: JSON `/api/profile`, `/api/jobs`, `/api/jobs/:id`, `/api/settings`, `/api/export`. Read routes return records; mutations share store validation. Conflicts use HTTP 409, invalid input 400, missing records 404.

- [x] Serve a responsive Chinese sidebar workspace, job filters and detail editing, profile editing and settings.
- [x] Apply same-origin checks, JSON body limits and safe static routing; never expose secret settings.
- [x] Verify HTTP CRUD, origin rejection and static delivery, then interact with the UI if browser tooling is available.

### Task 3: Skill and delivery docs

Files: `.claude/skills/cn-local-workspace/SKILL.md`, `.agents/skills/cn-local-workspace/SKILL.md`, `README.zh-CN.md`.

- [x] Document start, CLI examples, data location, backup, limitations and local privacy/model costs.
- [x] Provide thin-pointer Skill with canonical workflow and truthful implementation scope.
- [x] Review diff, run targeted checks, launch the website and report URL and remaining stages.

## Execution decisions

- Use JavaScript ES modules rather than TypeScript for this first small server so users can run directly with Node, with no package download or build prerequisite.
- Store original posting inside its atomic `job.json` record to prevent divergence between fields and text; exports preserve it in full. A separate Markdown mirror is deferred until there is a consumer requiring it.
- Honor the user's explicit request to start and finish without another approval exchange; prepare and execute this plan in the same session.

## Delivery record

- Seven focused Node checks pass, covering store persistence, CLI/HTTP interoperability, concurrent versions, damaged files, unsafe paths, secrets, and partial-write visibility.
- Browser check on an isolated disposable instance completed job creation, status editing, refresh persistence, and profile saving. The real workspace remains empty for the user.
- Skill validation passes for 11 skills; JavaScript syntax checks and diff whitespace check pass.
- Independent read-only review found two P2 issues (partially visible creation and incomplete stored-field validation); both fixed and re-reviewed without remaining important findings.
- Website launched at http://127.0.0.1:3210. Temporary browser-check server stopped.
- Stage one is delivered. AI calls, project evidence records, voice and browser extension remain future stages, clearly labeled in UI and docs.
