/**
 * specforge core: local spec-driven development over a specs/ tree.
 *
 * The workspace root comes from SPECFORGE_ROOT (default: the
 * process working directory). Each feature is a numbered
 * directory specs/<NNN>-<slug>/ holding constitution.md, spec.md,
 * plan.md, tasks.md, research.md, clarifications.json and a
 * contracts/ directory. The "current feature" is the
 * highest-numbered feature directory; tools that need one fail
 * with an honest error when none exists.
 *
 * Filesystem behaviour is real local logic. The git and quality
 * tools run external commands through an injectable Executor; the
 * default executor uses execFile, and a non-zero exit (or a
 * missing binary) surfaces as an error, never as success.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type {
  ArtifactReport,
  CheckResult,
  Clarification,
  ClarifyAddOptions,
  ClarifyResolveOptions,
  ConstitutionOptions,
  ExecResult,
  Executor,
  FeatureInfo,
  QualityResult,
  SpecRefineOptions,
  SpecValidateOptions,
  SpecifyStartOptions,
  TaskItem,
  TasksFilterOptions,
  TasksSearchOptions,
  TasksStatsOptions,
  TasksVisualizeOptions,
} from "./types.js";

export const VERSION = "0.1.0";
export const ROOT_ENV = "SPECFORGE_ROOT";

// --- root / feature resolution -------------------------------------------

export function resolveRoot(env: Record<string, string | undefined> = process.env): string {
  const v = typeof env[ROOT_ENV] === "string" ? env[ROOT_ENV].trim() : "";
  return path.resolve(v ? v : process.cwd());
}

export function specsDir(root: string): string {
  return path.join(path.resolve(root), "specs");
}

const FEATURE_RE = /^(\d+)-(.+)$/;

export function listFeatures(root: string): FeatureInfo[] {
  const dir = specsDir(root);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FeatureInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = FEATURE_RE.exec(e.name);
    if (!m) continue;
    out.push({
      name: e.name,
      number: parseInt(m[1], 10),
      slug: m[2],
      dir: path.join(dir, e.name),
    });
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

/** The current feature is the highest-numbered feature directory. */
export function currentFeature(root: string): FeatureInfo {
  const features = listFeatures(root);
  if (!features.length) {
    throw new Error(
      `no current feature: no numbered feature directories under ${specsDir(root)} (run specify_start first)`,
    );
  }
  return features[features.length - 1];
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "feature";
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

async function readText(file: string): Promise<string> {
  return fsp.readFile(file, "utf-8");
}

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fsp.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

/** Replace (or append) a `## <heading>` section in a markdown doc. */
export function setSection(content: string, heading: string, body: string): string {
  const clean = heading.replace(/^#+\s*/, "").trim();
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${clean}`);
  const replacement = [`## ${clean}`, "", body, ""];
  if (start === -1) {
    const base = content.endsWith("\n") || content === "" ? content : content + "\n";
    return `${base}\n${replacement.join("\n")}`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

export function getSection(content: string, heading: string): string {
  const clean = heading.replace(/^#+\s*/, "").trim();
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${clean}`);
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

// --- specify ---------------------------------------------------------------

export async function specifyStart(
  root: string,
  options: SpecifyStartOptions,
): Promise<{ feature: string; number: number; slug: string; dir: string; spec: string }> {
  const projectName = requireNonEmpty(options.projectName, "projectName");
  const slug = slugify(projectName);
  const features = listFeatures(root);
  const number = (features.length ? features[features.length - 1].number : 0) + 1;
  const name = `${pad(number)}-${slug}`;
  const dir = path.join(specsDir(root), name);
  await fsp.mkdir(path.join(dir, "contracts"), { recursive: true });
  const agent = typeof options.agent === "string" && options.agent.trim() ? options.agent.trim() : null;
  const spec = [
    `# ${projectName}`,
    "",
    "## Overview",
    "",
    `TODO: overview for ${projectName}.`,
    ...(agent ? ["", `Agent: ${agent}`] : []),
    "",
    "## User Stories",
    "",
    "<!-- describe the feature -->",
    "",
    "## Requirements",
    "",
    "- TODO: first requirement",
    "",
  ].join("\n");
  await fsp.writeFile(path.join(dir, "spec.md"), spec, "utf-8");
  await fsp.writeFile(path.join(dir, "research.md"), `# Research: ${projectName}\n\n`, "utf-8");
  return { feature: name, number, slug, dir, spec: path.join(dir, "spec.md") };
}

export async function specifyDescribe(
  root: string,
  description: string,
): Promise<{ feature: string; spec: string }> {
  const text = requireNonEmpty(description, "description");
  const feature = currentFeature(root);
  const file = path.join(feature.dir, "spec.md");
  const content = await readTextOrNull(file);
  if (content === null) throw new Error(`spec.md not found in current feature ${feature.name}`);
  await fsp.writeFile(file, setSection(content, "User Stories", text), "utf-8");
  return { feature: feature.name, spec: file };
}

export async function constitutionCreate(
  root: string,
  options: ConstitutionOptions,
): Promise<{ feature: string; constitution: string }> {
  if (!Array.isArray(options.principles) || !options.principles.length) {
    throw new Error("principles must be a non-empty array of strings");
  }
  const feature = currentFeature(root);
  const file = path.join(feature.dir, "constitution.md");
  const section = (title: string, items?: string[]) =>
    items && items.length
      ? [`## ${title}`, "", ...items.map((i) => `- ${i}`), ""]
      : [`## ${title}`, "", "(none)", ""];
  const doc = [
    "# Constitution",
    "",
    ...section("Principles", options.principles),
    ...section("Constraints", options.constraints),
    ...section("Preferences", options.preferences),
  ].join("\n");
  await fsp.writeFile(file, doc, "utf-8");
  return { feature: feature.name, constitution: file };
}

// --- clarifications ----------------------------------------------------------

async function readClarifications(feature: FeatureInfo): Promise<Clarification[]> {
  const file = path.join(feature.dir, "clarifications.json");
  const raw = await readTextOrNull(file);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`clarifications.json in ${feature.name} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`clarifications.json in ${feature.name} is not an array`);
  return parsed as Clarification[];
}

async function writeClarifications(feature: FeatureInfo, items: Clarification[]): Promise<void> {
  await fsp.writeFile(
    path.join(feature.dir, "clarifications.json"),
    JSON.stringify(items, null, 2) + "\n",
    "utf-8",
  );
}

export async function clarifyAdd(root: string, options: ClarifyAddOptions): Promise<Clarification> {
  const question = requireNonEmpty(options.question, "question");
  const feature = currentFeature(root);
  const items = await readClarifications(feature);
  let max = 0;
  for (const item of items) {
    const m = /^CLARIFY-(\d+)$/.exec(item.id ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const entry: Clarification = {
    id: `CLARIFY-${pad(max + 1)}`,
    question,
    context: typeof options.context === "string" && options.context.trim() ? options.context.trim() : null,
    resolution: null,
  };
  items.push(entry);
  await writeClarifications(feature, items);
  return entry;
}

export async function clarifyResolve(
  root: string,
  options: ClarifyResolveOptions,
): Promise<Clarification> {
  const id = requireNonEmpty(options.clarificationId, "clarificationId");
  const resolution = requireNonEmpty(options.resolution, "resolution");
  const feature = currentFeature(root);
  const items = await readClarifications(feature);
  const entry = items.find((i) => i.id === id);
  if (!entry) throw new Error(`clarification not found: ${id}`);
  entry.resolution = resolution;
  await writeClarifications(feature, items);
  return entry;
}

// --- spec validation / research / plan / refine -------------------------------

export async function specValidate(
  root: string,
  options: SpecValidateOptions = {},
): Promise<{ feature: string; valid: boolean; checks: CheckResult[] }> {
  const feature = currentFeature(root);
  const specFile = path.join(feature.dir, "spec.md");
  const spec = await readTextOrNull(specFile);
  const all: Record<string, () => CheckResult> = {
    spec_exists: () => ({
      name: "spec_exists",
      passed: spec !== null,
      detail: spec !== null ? "spec.md exists" : "spec.md is missing",
    }),
    spec_nonempty: () => ({
      name: "spec_nonempty",
      passed: spec !== null && spec.trim().length > 0,
      detail: spec !== null && spec.trim().length > 0 ? `spec.md has ${spec.trim().length} characters` : "spec.md is empty",
    }),
    user_stories_present: () => ({
      name: "user_stories_present",
      passed: spec !== null && getSection(spec, "User Stories") !== "",
      detail: spec !== null && getSection(spec, "User Stories") !== "" ? "a User Stories section exists" : "no User Stories section",
    }),
    user_stories_filled: () => {
      const body = spec === null ? "" : getSection(spec, "User Stories");
      const filled = body !== "" && !body.startsWith("<!--");
      return {
        name: "user_stories_filled",
        passed: filled,
        detail: filled ? "user stories have been described" : "user stories are still a placeholder",
      };
    },
    clarifications_valid: () => {
      const raw = fs.existsSync(path.join(feature.dir, "clarifications.json"))
        ? fs.readFileSync(path.join(feature.dir, "clarifications.json"), "utf-8")
        : null;
      if (raw === null) return { name: "clarifications_valid", passed: false, detail: "clarifications.json is missing" };
      try {
        const parsed: unknown = JSON.parse(raw);
        return { name: "clarifications_valid", passed: Array.isArray(parsed), detail: Array.isArray(parsed) ? "clarifications.json is a JSON array" : "clarifications.json is not an array" };
      } catch {
        return { name: "clarifications_valid", passed: false, detail: "clarifications.json is not valid JSON" };
      }
    },
    contracts_present: () => {
      const dir = path.join(feature.dir, "contracts");
      const ok = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      return { name: "contracts_present", passed: ok, detail: ok ? "contracts/ exists" : "contracts/ is missing" };
    },
  };
  let names = Object.keys(all);
  const requested = options.checks;
  if (requested && typeof requested === "object" && Object.keys(requested).length) {
    names = Object.keys(requested);
  }
  const checks: CheckResult[] = names.map((name) =>
    all[name] ? all[name]() : { name, passed: false, detail: `unknown check: ${name}` },
  );
  return { feature: feature.name, valid: checks.every((c) => c.passed), checks };
}

export async function researchAppend(
  root: string,
  content: string,
): Promise<{ feature: string; research: string; bytes: number }> {
  const text = requireNonEmpty(content, "content");
  const feature = currentFeature(root);
  const file = path.join(feature.dir, "research.md");
  if ((await readTextOrNull(file)) === null) {
    await fsp.writeFile(file, "# Research\n\n", "utf-8");
  }
  await fsp.appendFile(file, text + "\n", "utf-8");
  const stat = await fsp.stat(file);
  return { feature: feature.name, research: file, bytes: stat.size };
}

export async function planCreate(
  root: string,
  constraintsText: string,
): Promise<{ feature: string; plan: string }> {
  const text = requireNonEmpty(constraintsText, "constraintsText");
  const feature = currentFeature(root);
  const file = path.join(feature.dir, "plan.md");
  const doc = [
    "# Plan",
    "",
    "## Constraints",
    "",
    text,
    "",
    "## Approach",
    "",
    "Implement the feature described in spec.md within the constraints above.",
    "",
    "## Steps",
    "",
    "- Review spec.md and the constitution",
    "- Implement the feature",
    "- Verify against the spec",
    "",
  ].join("\n");
  await fsp.writeFile(file, doc, "utf-8");
  return { feature: feature.name, plan: file };
}

export async function specRefine(
  root: string,
  options: SpecRefineOptions,
): Promise<{ feature: string; spec: string; section: string }> {
  const section = requireNonEmpty(options.section, "section");
  const changes = requireNonEmpty(options.changes, "changes");
  const feature = currentFeature(root);
  const file = path.join(feature.dir, "spec.md");
  const content = await readTextOrNull(file);
  if (content === null) throw new Error(`spec.md not found in current feature ${feature.name}`);
  await fsp.writeFile(file, setSection(content, section, changes), "utf-8");
  return { feature: feature.name, spec: file, section: section.replace(/^#+\s*/, "").trim() };
}

// --- artifacts -----------------------------------------------------------------

const ARTIFACT_FILES: Record<string, string> = {
  spec: "spec.md",
  "spec.md": "spec.md",
  plan: "plan.md",
  "plan.md": "plan.md",
  tasks: "tasks.md",
  "tasks.md": "tasks.md",
  research: "research.md",
  "research.md": "research.md",
  constitution: "constitution.md",
  "constitution.md": "constitution.md",
  clarifications: "clarifications.json",
  "clarifications.json": "clarifications.json",
  contracts: "contracts",
};

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else total += (await fsp.stat(full)).size;
  }
  return total;
}

export async function artifactsAnalyze(
  root: string,
  artifacts: string[],
): Promise<{ feature: string; artifacts: ArtifactReport[] }> {
  if (!Array.isArray(artifacts) || !artifacts.length) {
    throw new Error("artifacts must be a non-empty array of strings");
  }
  const feature = currentFeature(root);
  const reports: ArtifactReport[] = [];
  for (const rawName of artifacts) {
    const name = requireNonEmpty(rawName, "artifact");
    const rel = ARTIFACT_FILES[name] ?? name;
    const full = path.join(feature.dir, rel);
    let exists = false;
    let size = 0;
    try {
      const stat = await fsp.stat(full);
      exists = true;
      size = stat.isDirectory() ? await dirSize(full) : stat.size;
    } catch {
      exists = false;
      size = 0;
    }
    reports.push({ name, path: full, exists, size });
  }
  return { feature: feature.name, artifacts: reports };
}

// --- tasks -----------------------------------------------------------------------

const TASK_RE = /^- \[( |x|X)\] (T-\d+)\s+(.+)$/;

export function parseTasks(content: string): TaskItem[] {
  const out: TaskItem[] = [];
  for (const line of content.split("\n")) {
    const m = TASK_RE.exec(line.trimEnd());
    if (m) out.push({ id: m[2], done: m[1] !== " ", text: m[3].trim() });
  }
  return out;
}

function renderTasks(tasks: TaskItem[], header: string[]): string {
  return [...header, "", ...tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.id} ${t.text}`), ""].join("\n");
}

async function readTasksFile(feature: FeatureInfo): Promise<string> {
  const file = path.join(feature.dir, "tasks.md");
  const content = await readTextOrNull(file);
  if (content === null) throw new Error(`tasks.md not found in current feature ${feature.name} (run tasks_generate first)`);
  return content;
}

export async function tasksGenerate(
  root: string,
  scope?: string,
): Promise<{ feature: string; tasks: string; count: number; items: TaskItem[] }> {
  const feature = currentFeature(root);
  const specFile = path.join(feature.dir, "spec.md");
  const spec = await readTextOrNull(specFile);
  if (spec === null) throw new Error(`spec.md not found in current feature ${feature.name}`);
  const candidates: string[] = [];
  for (const line of spec.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const text = trimmed.slice(2).trim();
    if (!text || text.includes("TODO") || text.startsWith("[ ]") || text.startsWith("[x]")) continue;
    candidates.push(text);
  }
  const texts = candidates.length
    ? candidates
    : [
        "Implement the feature described in spec.md",
        "Add tests for the feature",
        "Update documentation for the feature",
      ];
  const items: TaskItem[] = texts.map((text, i) => ({ id: `T-${pad(i + 1)}`, text, done: false }));
  const header = ["# Tasks", ...(scope && scope.trim() ? ["", `Scope: ${scope.trim()}`] : [])];
  const file = path.join(feature.dir, "tasks.md");
  await fsp.writeFile(file, renderTasks(items, header), "utf-8");
  return { feature: feature.name, tasks: file, count: items.length, items };
}

export async function tasksTick(root: string, taskId: string): Promise<TaskItem> {
  const id = requireNonEmpty(taskId, "taskId");
  const feature = currentFeature(root);
  const content = await readTasksFile(feature);
  const tasks = parseTasks(content);
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error(`task not found: ${id}`);
  task.done = true;
  const header = content.split("\n").filter((l) => !TASK_RE.test(l.trimEnd()) && l.trim() !== "");
  await fsp.writeFile(path.join(feature.dir, "tasks.md"), renderTasks(tasks, header.length ? header : ["# Tasks"]), "utf-8");
  return task;
}

export async function tasksTickRange(
  root: string,
  taskIds: string[],
): Promise<{ ticked: TaskItem[]; missing: string[] }> {
  if (!Array.isArray(taskIds) || !taskIds.length) {
    throw new Error("taskIds must be a non-empty array of strings");
  }
  const ticked: TaskItem[] = [];
  const missing: string[] = [];
  for (const id of taskIds) {
    try {
      ticked.push(await tasksTick(root, id));
    } catch {
      missing.push(id);
    }
  }
  return { ticked, missing };
}

export async function tasksFilter(
  root: string,
  options: TasksFilterOptions = {},
): Promise<{ feature: string; preset: string; tasks: TaskItem[] }> {
  const feature = currentFeature(root);
  const tasks = parseTasks(await readTasksFile(feature));
  const preset = (options.preset ?? "actionable").trim() || "actionable";
  let filtered: TaskItem[];
  if (preset === "actionable" || preset === "pending" || preset === "open") {
    filtered = tasks.filter((t) => !t.done);
  } else if (preset === "done" || preset === "completed") {
    filtered = tasks.filter((t) => t.done);
  } else if (preset === "all") {
    filtered = tasks;
  } else {
    throw new Error(`unknown preset: ${preset} (expected actionable, done or all)`);
  }
  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    filtered = filtered.slice(0, Math.max(0, Math.floor(options.limit)));
  }
  return { feature: feature.name, preset, tasks: filtered };
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i >= needle.length) return true;
  }
  return needle.length === 0;
}

export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return false;
  if (t.includes(q)) return true;
  return q.split(/\s+/).every((token) => t.includes(token) || isSubsequence(token, t));
}

export async function tasksSearch(
  root: string,
  options: TasksSearchOptions,
): Promise<{ feature: string; query: string; matches: TaskItem[] }> {
  const query = requireNonEmpty(options.query, "query");
  const feature = currentFeature(root);
  const tasks = parseTasks(await readTasksFile(feature));
  const matches = options.fuzzy
    ? tasks.filter((t) => fuzzyMatch(t.text, query))
    : tasks.filter((t) => t.text.toLowerCase().includes(query.toLowerCase()));
  return { feature: feature.name, query, matches };
}

export async function tasksVisualize(
  root: string,
  options: TasksVisualizeOptions = {},
): Promise<{ feature: string; format: string; content: string }> {
  const feature = currentFeature(root);
  const tasks = parseTasks(await readTasksFile(feature));
  const format = (options.format ?? "text").trim().toLowerCase() || "text";
  if (format === "mermaid") {
    const lines = ["```mermaid", "flowchart TD"];
    tasks.forEach((t, i) => {
      lines.push(`  T${i}["${t.id} ${t.text.replace(/"/g, "'")} (${t.done ? "done" : "pending"})"]`);
      if (i > 0) lines.push(`  T${i - 1} --> T${i}`);
    });
    lines.push("```");
    return { feature: feature.name, format, content: lines.join("\n") };
  }
  if (format !== "text") throw new Error(`unknown format: ${format} (expected text or mermaid)`);
  const content = tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.id} ${t.text}`).join("\n");
  return { feature: feature.name, format, content };
}

export async function tasksStats(
  root: string,
  options: TasksStatsOptions = {},
): Promise<{
  feature: string;
  total: number;
  done: number;
  pending: number;
  groupBy: string;
  groups: Record<string, number>;
  chart?: string;
}> {
  const feature = currentFeature(root);
  const tasks = parseTasks(await readTasksFile(feature));
  const done = tasks.filter((t) => t.done).length;
  const pending = tasks.length - done;
  const groupBy = (options.groupBy ?? "status").trim() || "status";
  const groups: Record<string, number> = groupBy === "status"
    ? { done, pending }
    : { [groupBy]: tasks.length };
  const result: {
    feature: string; total: number; done: number; pending: number;
    groupBy: string; groups: Record<string, number>; chart?: string;
  } = { feature: feature.name, total: tasks.length, done, pending, groupBy, groups };
  if (options.includeCharts) {
    result.chart = [
      `done    | ${"#".repeat(done)} ${done}`,
      `pending | ${"#".repeat(pending)} ${pending}`,
    ].join("\n");
  }
  return result;
}

// --- executor-backed tools ---------------------------------------------------------

export const defaultExecutor: Executor = (command, args, cwd) =>
  new Promise<ExecResult>((resolve) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      const out = typeof stdout === "string" ? stdout : String(stdout);
      const errText = typeof stderr === "string" ? stderr : String(stderr);
      if (error) {
        const code = typeof (error as { code?: unknown }).code === "number"
          ? ((error as { code: number }).code)
          : 1;
        resolve({ stdout: out, stderr: errText || error.message, exitCode: code });
      } else {
        resolve({ stdout: out, stderr: errText, exitCode: 0 });
      }
    });
  });

async function runCommand(
  label: string,
  executor: Executor,
  root: string,
  command: string,
  args: string[],
): Promise<QualityResult> {
  const result = await executor(command, args, path.resolve(root));
  const rendered = [command, ...args].join(" ");
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${label} failed (exit ${result.exitCode}): ${rendered}${detail ? `: ${detail}` : ""}`);
  }
  return { command: rendered, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

export async function gitCreateBranch(
  root: string,
  branchName: string,
  executor: Executor = defaultExecutor,
): Promise<QualityResult & { branch: string }> {
  const branch = requireNonEmpty(branchName, "branchName");
  if (/\s/.test(branch)) throw new Error("branchName must not contain whitespace");
  const result = await runCommand("git_create_branch", executor, root, "git", ["checkout", "-b", branch]);
  return { ...result, branch };
}

export async function qualityFormat(
  root: string,
  fix = false,
  executor: Executor = defaultExecutor,
): Promise<QualityResult> {
  return runCommand("quality_format", executor, root, "npx", ["prettier", fix ? "--write" : "--check", "."]);
}

export async function qualityLint(
  root: string,
  fix = false,
  executor: Executor = defaultExecutor,
): Promise<QualityResult> {
  const args = ["eslint", "."];
  if (fix) args.push("--fix");
  return runCommand("quality_lint", executor, root, "npx", args);
}

export async function qualityTest(
  root: string,
  coverage = false,
  executor: Executor = defaultExecutor,
): Promise<QualityResult> {
  const args = coverage ? ["test", "--", "--coverage"] : ["test"];
  return runCommand("quality_test", executor, root, "npm", args);
}

export async function qualitySecurityAudit(
  root: string,
  fix = false,
  executor: Executor = defaultExecutor,
): Promise<QualityResult> {
  const args = fix ? ["audit", "fix"] : ["audit"];
  return runCommand("quality_security_audit", executor, root, "npm", args);
}

/** Render a result as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
