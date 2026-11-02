#!/usr/bin/env node
/**
 * specforge CLI. Subcommands mirror the MCP tool names:
 *
 *   specforge specify_start --project-name <name> [--agent <a>]
 *   specforge specify_describe --description <text>
 *   specforge constitution_create --principles a,b [--constraints a,b] [--preferences a,b]
 *   specforge clarify_add --question <q> [--context <c>]
 *   specforge clarify_resolve --clarification-id <id> --resolution <r>
 *   specforge spec_validate [--checks <json-object>]
 *   specforge research_append --content <text>
 *   specforge plan_create --constraints-text <text>
 *   specforge spec_refine --section <name> --changes <text>
 *   specforge artifacts_analyze --artifacts spec,plan,tasks
 *   specforge tasks_generate [--scope <s>]
 *   specforge tasks_tick --task-id T-001
 *   specforge tasks_tick_range --task-ids T-001,T-002
 *   specforge tasks_filter [--preset actionable|done|all] [--limit <n>]
 *   specforge tasks_search --query <q> [--fuzzy true]
 *   specforge tasks_visualize [--format text|mermaid]
 *   specforge tasks_stats [--group-by status] [--include-charts true]
 *   specforge git_create_branch --branch-name <name>
 *   specforge quality_format [--fix true]
 *   specforge quality_lint [--fix true]
 *   specforge quality_test [--coverage true]
 *   specforge quality_security_audit [--fix true]
 *   specforge mcp
 *
 * Env: SPECFORGE_ROOT (workspace root, default the working
 * directory). Exit codes: 0 success, 1 error, 2 usage error.
 */
import {
  artifactsAnalyze,
  clarifyAdd,
  clarifyResolve,
  constitutionCreate,
  formatPayload,
  gitCreateBranch,
  planCreate,
  qualityFormat,
  qualityLint,
  qualitySecurityAudit,
  qualityTest,
  researchAppend,
  resolveRoot,
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
  VERSION,
} from "./specforge.js";

const TOOLS = [
  "specify_start", "specify_describe", "constitution_create",
  "clarify_add", "clarify_resolve", "spec_validate", "research_append",
  "plan_create", "spec_refine", "artifacts_analyze", "tasks_generate",
  "tasks_tick", "tasks_tick_range", "tasks_filter", "tasks_search",
  "tasks_visualize", "tasks_stats", "git_create_branch",
  "quality_format", "quality_lint", "quality_test",
  "quality_security_audit",
];

function usage(): never {
  console.error(`Usage:
  specforge <tool> [flags]
  specforge mcp
  specforge --version

Tools: ${TOOLS.join(", ")}

Flags: --project-name <n> --agent <a> --description <t>
  --principles a,b --constraints a,b --preferences a,b
  --question <q> --context <c> --clarification-id <id> --resolution <r>
  --checks <json> --content <t> --constraints-text <t> --section <s>
  --changes <t> --artifacts a,b --scope <s> --task-id <id>
  --task-ids a,b --preset <p> --limit <n> --query <q> --fuzzy true
  --format text|mermaid --group-by <g> --include-charts true
  --branch-name <b> --fix true --coverage true`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function reqFlag(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (!v) usage();
  return v;
}

function listFlag(rest: string[], name: string): string[] | undefined {
  const v = flag(rest, name);
  if (v === undefined) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function boolFlag(rest: string[], name: string): boolean | undefined {
  const v = flag(rest, name);
  if (v === undefined) return undefined;
  return v === "true";
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !TOOLS.includes(cmd)) usage();
  const root = resolveRoot(process.env);
  try {
    let out: unknown;
    switch (cmd) {
      case "specify_start": out = await specifyStart(root, { projectName: reqFlag(rest, "--project-name"), agent: flag(rest, "--agent") }); break;
      case "specify_describe": out = await specifyDescribe(root, reqFlag(rest, "--description")); break;
      case "constitution_create": out = await constitutionCreate(root, {
        principles: listFlag(rest, "--principles") ?? usage(),
        constraints: listFlag(rest, "--constraints"),
        preferences: listFlag(rest, "--preferences"),
      }); break;
      case "clarify_add": out = await clarifyAdd(root, { question: reqFlag(rest, "--question"), context: flag(rest, "--context") }); break;
      case "clarify_resolve": out = await clarifyResolve(root, { clarificationId: reqFlag(rest, "--clarification-id"), resolution: reqFlag(rest, "--resolution") }); break;
      case "spec_validate": {
        const raw = flag(rest, "--checks");
        let checks: Record<string, unknown> | undefined;
        if (raw !== undefined) {
          try { checks = JSON.parse(raw) as Record<string, unknown>; } catch { usage(); }
        }
        out = await specValidate(root, { checks });
        break;
      }
      case "research_append": out = await researchAppend(root, reqFlag(rest, "--content")); break;
      case "plan_create": out = await planCreate(root, reqFlag(rest, "--constraints-text")); break;
      case "spec_refine": out = await specRefine(root, { section: reqFlag(rest, "--section"), changes: reqFlag(rest, "--changes") }); break;
      case "artifacts_analyze": out = await artifactsAnalyze(root, listFlag(rest, "--artifacts") ?? usage()); break;
      case "tasks_generate": out = await tasksGenerate(root, flag(rest, "--scope")); break;
      case "tasks_tick": out = await tasksTick(root, reqFlag(rest, "--task-id")); break;
      case "tasks_tick_range": out = await tasksTickRange(root, listFlag(rest, "--task-ids") ?? usage()); break;
      case "tasks_filter": {
        const limitRaw = flag(rest, "--limit");
        out = await tasksFilter(root, {
          preset: flag(rest, "--preset"),
          limit: limitRaw === undefined ? undefined : parseInt(limitRaw, 10),
        });
        break;
      }
      case "tasks_search": out = await tasksSearch(root, { query: reqFlag(rest, "--query"), fuzzy: boolFlag(rest, "--fuzzy") }); break;
      case "tasks_visualize": out = await tasksVisualize(root, { format: flag(rest, "--format") }); break;
      case "tasks_stats": out = await tasksStats(root, { groupBy: flag(rest, "--group-by"), includeCharts: boolFlag(rest, "--include-charts") }); break;
      case "git_create_branch": out = await gitCreateBranch(root, reqFlag(rest, "--branch-name")); break;
      case "quality_format": out = await qualityFormat(root, boolFlag(rest, "--fix") ?? false); break;
      case "quality_lint": out = await qualityLint(root, boolFlag(rest, "--fix") ?? false); break;
      case "quality_test": out = await qualityTest(root, boolFlag(rest, "--coverage") ?? false); break;
      default: out = await qualitySecurityAudit(root, boolFlag(rest, "--fix") ?? false); break;
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
