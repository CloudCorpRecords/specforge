import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  artifactsAnalyze,
  clarifyAdd,
  clarifyResolve,
  constitutionCreate,
  currentFeature,
  gitCreateBranch,
  listFeatures,
  planCreate,
  qualityFormat,
  qualityLint,
  qualitySecurityAudit,
  qualityTest,
  researchAppend,
  resolveRoot,
  slugify,
  specRefine,
  specValidate,
  specifyDescribe,
  specifyStart,
  tasksFilter,
  tasksGenerate,
  tasksSearch,
  tasksStats,
  tasksTick,
  tasksTickRange,
  tasksVisualize,
} from "../src/specforge.js";
import type { ExecResult, Executor } from "../src/types.js";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "specforge-test-"));
}

async function startedRoot(): Promise<{ root: string; dir: string }> {
  const root = tempRoot();
  const started = await specifyStart(root, { projectName: "Widget API" });
  return { root, dir: started.dir };
}

interface CapturedCall { command: string; args: string[]; cwd: string }

function fakeExecutor(result: Partial<ExecResult> = {}): { executor: Executor; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const executor: Executor = async (command, args, cwd) => {
    calls.push({ command, args, cwd });
    return { stdout: "ok", stderr: "", exitCode: 0, ...result };
  };
  return { executor, calls };
}

describe("root and slug helpers", () => {
  it("resolveRoot honours SPECFORGE_ROOT and slugify normalises names", () => {
    assert.equal(resolveRoot({ SPECFORGE_ROOT: "/tmp/example root" }), path.resolve("/tmp/example root"));
    assert.equal(slugify("Widget API! v2"), "widget-api-v2");
    assert.equal(slugify("!!!"), "feature");
  });
});

describe("specify flow", () => {
  it("specify_start creates the numbered dir, spec template, contracts/ and research.md", async () => {
    const root = tempRoot();
    const out = await specifyStart(root, { projectName: "Widget API", agent: "claude" });
    assert.equal(out.feature, "001-widget-api");
    assert.equal(fs.existsSync(path.join(out.dir, "spec.md")), true);
    assert.equal(fs.existsSync(path.join(out.dir, "research.md")), true);
    assert.equal(fs.statSync(path.join(out.dir, "contracts")).isDirectory(), true);
    const spec = fs.readFileSync(path.join(out.dir, "spec.md"), "utf-8");
    assert.match(spec, /# Widget API/);
    assert.match(spec, /Agent: claude/);
  });

  it("numbering increments and the current feature is the highest number", async () => {
    const root = tempRoot();
    await specifyStart(root, { projectName: "First" });
    const second = await specifyStart(root, { projectName: "Second" });
    assert.equal(second.feature, "002-second");
    assert.deepEqual(listFeatures(root).map((f) => f.name), ["001-first", "002-second"]);
    assert.equal(currentFeature(root).name, "002-second");
  });

  it("tools needing a current feature error honestly when none exists", async () => {
    const root = tempRoot();
    await assert.rejects(() => specifyDescribe(root, "x"), /no current feature/);
    await assert.rejects(() => tasksGenerate(root), /no current feature/);
    assert.throws(() => currentFeature(root), /no current feature/);
  });

  it("specify_describe writes the description into the User Stories section", async () => {
    const { root, dir } = await startedRoot();
    await specifyDescribe(root, "As a user I can create widgets.");
    const spec = fs.readFileSync(path.join(dir, "spec.md"), "utf-8");
    assert.match(spec, /## User Stories\n\nAs a user I can create widgets\./);
  });

  it("constitution_create writes principles, constraints and preferences", async () => {
    const { root, dir } = await startedRoot();
    await constitutionCreate(root, { principles: ["Ship small"], constraints: ["Node 20"], preferences: ["Tabs"] });
    const doc = fs.readFileSync(path.join(dir, "constitution.md"), "utf-8");
    assert.match(doc, /## Principles\n\n- Ship small/);
    assert.match(doc, /## Constraints\n\n- Node 20/);
    assert.match(doc, /## Preferences\n\n- Tabs/);
    await assert.rejects(() => constitutionCreate(root, { principles: [] }), /principles/);
  });

  it("spec_refine replaces a named section and appends a new one", async () => {
    const { root, dir } = await startedRoot();
    await specRefine(root, { section: "Requirements", changes: "- Must be fast" });
    let spec = fs.readFileSync(path.join(dir, "spec.md"), "utf-8");
    assert.match(spec, /## Requirements\n\n- Must be fast/);
    assert.doesNotMatch(spec, /TODO: first requirement/);
    await specRefine(root, { section: "Risks", changes: "Scope creep." });
    spec = fs.readFileSync(path.join(dir, "spec.md"), "utf-8");
    assert.match(spec, /## Risks\n\nScope creep\./);
  });
});

describe("clarifications", () => {
  it("clarify_add assigns CLARIFY-NNN ids with null resolution; clarify_resolve sets it", async () => {
    const { root, dir } = await startedRoot();
    const first = await clarifyAdd(root, { question: "Which database?", context: "storage" });
    assert.deepEqual(first, { id: "CLARIFY-001", question: "Which database?", context: "storage", resolution: null });
    const second = await clarifyAdd(root, { question: "Offline mode?" });
    assert.equal(second.id, "CLARIFY-002");
    assert.equal(second.context, null);
    const resolved = await clarifyResolve(root, { clarificationId: "CLARIFY-001", resolution: "Postgres" });
    assert.equal(resolved.resolution, "Postgres");
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "clarifications.json"), "utf-8"));
    assert.equal(stored.length, 2);
    assert.equal(stored[0].resolution, "Postgres");
    assert.equal(stored[1].resolution, null);
  });

  it("clarify_resolve errors for an unknown id", async () => {
    const { root } = await startedRoot();
    await clarifyAdd(root, { question: "Q?" });
    await assert.rejects(() => clarifyResolve(root, { clarificationId: "CLARIFY-999", resolution: "x" }), /clarification not found/);
  });
});

describe("spec_validate, research and plan", () => {
  it("spec_validate reports per-check results and honours a checks subset", async () => {
    const { root } = await startedRoot();
    const all = await specValidate(root);
    assert.equal(all.feature, "001-widget-api");
    const byName = Object.fromEntries(all.checks.map((c) => [c.name, c.passed]));
    assert.equal(byName.spec_exists, true);
    assert.equal(byName.spec_nonempty, true);
    assert.equal(byName.user_stories_present, true);
    assert.equal(byName.user_stories_filled, false); // placeholder comment
    assert.equal(byName.clarifications_valid, false); // not created yet
    assert.equal(byName.contracts_present, true);
    assert.equal(all.valid, false);
    await specifyDescribe(root, "As a user...");
    await clarifyAdd(root, { question: "Q?" });
    const after = await specValidate(root);
    assert.equal(after.valid, true);
    const subset = await specValidate(root, { checks: { spec_exists: true } });
    assert.deepEqual(subset.checks.map((c) => c.name), ["spec_exists"]);
    const unknown = await specValidate(root, { checks: { nope: true } });
    assert.equal(unknown.checks[0].passed, false);
  });

  it("research_append appends content and plan_create writes the constraints", async () => {
    const { root, dir } = await startedRoot();
    await researchAppend(root, "Found a library.");
    const out = await researchAppend(root, "It fits.");
    assert.ok(out.bytes > 0);
    const research = fs.readFileSync(path.join(dir, "research.md"), "utf-8");
    assert.match(research, /Found a library\.\nIt fits\./);
    await planCreate(root, "Must ship by Friday.");
    const plan = fs.readFileSync(path.join(dir, "plan.md"), "utf-8");
    assert.match(plan, /## Constraints\n\nMust ship by Friday\./);
  });

  it("artifacts_analyze reports presence and size, including missing artifacts", async () => {
    const { root } = await startedRoot();
    const out = await artifactsAnalyze(root, ["spec", "plan", "contracts"]);
    const spec = out.artifacts.find((a) => a.name === "spec");
    const plan = out.artifacts.find((a) => a.name === "plan");
    assert.equal(spec?.exists, true);
    assert.ok((spec?.size ?? 0) > 0);
    assert.equal(plan?.exists, false);
    assert.equal(plan?.size, 0);
    assert.equal(out.artifacts.find((a) => a.name === "contracts")?.exists, true);
  });
});

describe("tasks", () => {
  async function withTasks(): Promise<{ root: string; dir: string }> {
    const { root, dir } = await startedRoot();
    await specRefine(root, { section: "Requirements", changes: "- Build the widget form\n- Wire the widget endpoint" });
    return { root, dir };
  }

  it("tasks_generate derives tasks from spec bullets with T-NNN ids", async () => {
    const { root, dir } = await withTasks();
    const out = await tasksGenerate(root, "backend");
    assert.equal(out.count, 2);
    assert.deepEqual(out.items.map((t) => t.id), ["T-001", "T-002"]);
    assert.equal(out.items[0].text, "Build the widget form");
    const tasks = fs.readFileSync(path.join(dir, "tasks.md"), "utf-8");
    assert.match(tasks, /Scope: backend/);
    assert.match(tasks, /- \[ \] T-001 Build the widget form/);
  });

  it("tasks_generate falls back to default tasks when the spec has no usable bullets", async () => {
    const { root } = await startedRoot();
    const out = await tasksGenerate(root);
    assert.equal(out.count, 3);
    assert.match(out.items[0].text, /Implement the feature/);
  });

  it("tasks_tick marks one task done and errors for unknown ids", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    const ticked = await tasksTick(root, "T-001");
    assert.equal(ticked.done, true);
    await assert.rejects(() => tasksTick(root, "T-999"), /task not found/);
  });

  it("tasks_tick_range ticks several and reports the missing ones", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    const out = await tasksTickRange(root, ["T-001", "T-002", "T-999"]);
    assert.deepEqual(out.ticked.map((t) => t.id), ["T-001", "T-002"]);
    assert.deepEqual(out.missing, ["T-999"]);
  });

  it("tasks_filter lists actionable tasks by default, honours preset and limit", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    await tasksTick(root, "T-001");
    const actionable = await tasksFilter(root);
    assert.deepEqual(actionable.tasks.map((t) => t.id), ["T-002"]);
    const done = await tasksFilter(root, { preset: "done" });
    assert.deepEqual(done.tasks.map((t) => t.id), ["T-001"]);
    const limited = await tasksFilter(root, { preset: "all", limit: 1 });
    assert.equal(limited.tasks.length, 1);
    await assert.rejects(() => tasksFilter(root, { preset: "bogus" }), /unknown preset/);
  });

  it("tasks_search matches substrings and, with fuzzy, subsequences", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    const plain = await tasksSearch(root, { query: "widget form" });
    assert.deepEqual(plain.matches.map((t) => t.id), ["T-001"]);
    const noMatch = await tasksSearch(root, { query: "wgtfrm" });
    assert.equal(noMatch.matches.length, 0);
    const fuzzy = await tasksSearch(root, { query: "wgtfrm", fuzzy: true });
    assert.deepEqual(fuzzy.matches.map((t) => t.id), ["T-001"]);
  });

  it("tasks_visualize renders text and mermaid", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    const text = await tasksVisualize(root);
    assert.match(text.content, /\[ \] T-001 Build the widget form/);
    const mermaid = await tasksVisualize(root, { format: "mermaid" });
    assert.match(mermaid.content, /flowchart TD/);
    await assert.rejects(() => tasksVisualize(root, { format: "svg" }), /unknown format/);
  });

  it("tasks_stats reports counts, groups and an optional chart", async () => {
    const { root } = await withTasks();
    await tasksGenerate(root);
    await tasksTick(root, "T-002");
    const stats = await tasksStats(root, { includeCharts: true });
    assert.equal(stats.total, 2);
    assert.equal(stats.done, 1);
    assert.equal(stats.pending, 1);
    assert.deepEqual(stats.groups, { done: 1, pending: 1 });
    assert.match(stats.chart ?? "", /done    \| # 1/);
    const bare = await tasksStats(root);
    assert.equal(bare.chart, undefined);
  });

  it("task tools error honestly when tasks.md does not exist", async () => {
    const { root } = await startedRoot();
    await assert.rejects(() => tasksFilter(root), /tasks\.md not found/);
    await assert.rejects(() => tasksStats(root), /tasks\.md not found/);
  });
});

describe("executor-backed tools (fake executor only)", () => {
  it("git_create_branch runs git checkout -b through the executor", async () => {
    const root = tempRoot();
    const { executor, calls } = fakeExecutor({ stdout: "Switched to a new branch" });
    const out = await gitCreateBranch(root, "feature/widgets", executor);
    assert.equal(out.branch, "feature/widgets");
    assert.deepEqual(calls, [{ command: "git", args: ["checkout", "-b", "feature/widgets"], cwd: root }]);
    await assert.rejects(() => gitCreateBranch(root, "has space", executor), /whitespace/);
  });

  it("a failing executor result is an honest error, not success", async () => {
    const root = tempRoot();
    const { executor } = fakeExecutor({ exitCode: 128, stderr: "not a git repository", stdout: "" });
    await assert.rejects(() => gitCreateBranch(root, "x", executor), /git_create_branch failed \(exit 128\):.*not a git repository/);
  });

  it("quality tools run their documented commands", async () => {
    const root = tempRoot();
    const a = fakeExecutor(); await qualityFormat(root, false, a.executor);
    assert.deepEqual([a.calls[0].command, a.calls[0].args], ["npx", ["prettier", "--check", "."]]);
    const b = fakeExecutor(); await qualityFormat(root, true, b.executor);
    assert.deepEqual(b.calls[0].args, ["prettier", "--write", "."]);
    const c = fakeExecutor(); await qualityLint(root, true, c.executor);
    assert.deepEqual([c.calls[0].command, c.calls[0].args], ["npx", ["eslint", ".", "--fix"]]);
    const d = fakeExecutor(); await qualityTest(root, true, d.executor);
    assert.deepEqual([d.calls[0].command, d.calls[0].args], ["npm", ["test", "--", "--coverage"]]);
    const e = fakeExecutor(); await qualityTest(root, false, e.executor);
    assert.deepEqual(e.calls[0].args, ["test"]);
    const f = fakeExecutor(); await qualitySecurityAudit(root, false, f.executor);
    assert.deepEqual([f.calls[0].command, f.calls[0].args], ["npm", ["audit"]]);
    const g = fakeExecutor(); await qualitySecurityAudit(root, true, g.executor);
    assert.deepEqual(g.calls[0].args, ["audit", "fix"]);
  });

  it("quality tools surface a failing command as an error", async () => {
    const root = tempRoot();
    const { executor } = fakeExecutor({ exitCode: 2, stderr: "prettier not found", stdout: "" });
    await assert.rejects(() => qualityFormat(root, false, executor), /quality_format failed \(exit 2\)/);
    const failingLint = fakeExecutor({ exitCode: 1, stderr: "lint errors", stdout: "" });
    await assert.rejects(() => qualityLint(root, false, failingLint.executor), /quality_lint failed/);
  });
});
