/**
 * specforge MCP server.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Config is read from the environment at call time: SPECFORGE_ROOT
 * (optional, default the process working directory) is the
 * workspace root holding the specs/ tree.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const SpecifyStartArgs = z.object({ projectName: z.string(), agent: z.string().optional() });
const SpecifyDescribeArgs = z.object({ description: z.string() });
const ConstitutionArgs = z.object({
  principles: z.array(z.string()),
  constraints: z.array(z.string()).optional(),
  preferences: z.array(z.string()).optional(),
});
const ClarifyAddArgs = z.object({ question: z.string(), context: z.string().optional() });
const ClarifyResolveArgs = z.object({ clarificationId: z.string(), resolution: z.string() });
const SpecValidateArgs = z.object({ checks: z.record(z.string(), z.unknown()).optional() });
const ResearchAppendArgs = z.object({ content: z.string() });
const PlanCreateArgs = z.object({ constraintsText: z.string() });
const SpecRefineArgs = z.object({ section: z.string(), changes: z.string() });
const ArtifactsAnalyzeArgs = z.object({ artifacts: z.array(z.string()) });
const TasksGenerateArgs = z.object({ scope: z.string().optional() });
const TasksTickArgs = z.object({ taskId: z.string() });
const TasksTickRangeArgs = z.object({ taskIds: z.array(z.string()) });
const TasksFilterArgs = z.object({ preset: z.string().optional(), limit: z.number().int().optional() });
const TasksSearchArgs = z.object({ query: z.string(), fuzzy: z.boolean().optional() });
const TasksVisualizeArgs = z.object({ format: z.string().optional() });
const TasksStatsArgs = z.object({ groupBy: z.string().optional(), includeCharts: z.boolean().optional() });
const GitCreateBranchArgs = z.object({ branchName: z.string() });
const QualityFormatArgs = z.object({ fix: z.boolean().optional() });
const QualityLintArgs = z.object({ fix: z.boolean().optional() });
const QualityTestArgs = z.object({ coverage: z.boolean().optional() });
const QualityAuditArgs = z.object({ fix: z.boolean().optional() });

const STR = { type: "string" as const };
const STR_ARRAY = { type: "array" as const, items: { type: "string" } };
const BOOL = { type: "boolean" as const };

const TOOLS = [
  {
    name: "specify_start",
    description: "Start a new feature: create the next numbered feature directory with a spec template, a contracts directory and a research file.",
    inputSchema: {
      type: "object" as const,
      properties: { projectName: { ...STR, description: "Project name for the new feature." }, agent: { ...STR, description: "Agent name recorded with the feature, when given." } },
      required: ["projectName"],
    },
  },
  {
    name: "specify_describe",
    description: "Write a feature description into the current feature's spec user-story section.",
    inputSchema: {
      type: "object" as const,
      properties: { description: { ...STR, description: "Feature description text written into the spec user-story section." } },
      required: ["description"],
    },
  },
  {
    name: "constitution_create",
    description: "Write a constitution for the current feature from principles, with optional constraints and preferences.",
    inputSchema: {
      type: "object" as const,
      properties: { principles: { ...STR_ARRAY, description: "List of constitution principles." }, constraints: { ...STR_ARRAY, description: "Optional list of constraints." }, preferences: { ...STR_ARRAY, description: "Optional list of preferences." } },
      required: ["principles"],
    },
  },
  {
    name: "clarify_add",
    description: "Add a clarification question to the current feature's clarifications list.",
    inputSchema: {
      type: "object" as const,
      properties: { question: { ...STR, description: "Clarification question to add." }, context: { ...STR, description: "Optional context for the question." } },
      required: ["question"],
    },
  },
  {
    name: "clarify_resolve",
    description: "Resolve a clarification by id with a resolution.",
    inputSchema: {
      type: "object" as const,
      properties: { clarificationId: { ...STR, description: "Id of the clarification to resolve." }, resolution: { ...STR, description: "Resolution text for the clarification." } },
      required: ["clarificationId", "resolution"],
    },
  },
  {
    name: "spec_validate",
    description: "Validate the current feature's spec for presence and completeness, returning per-check results.",
    inputSchema: {
      type: "object" as const,
      properties: { checks: { type: "object" as const, description: "Optional checks object selecting which validations to run." } },
    },
  },
  {
    name: "research_append",
    description: "Append content to the current feature's research file.",
    inputSchema: {
      type: "object" as const,
      properties: { content: { ...STR, description: "Content to append to the research file." } },
      required: ["content"],
    },
  },
  {
    name: "plan_create",
    description: "Create a plan for the current feature from constraint text.",
    inputSchema: {
      type: "object" as const,
      properties: { constraintsText: { ...STR, description: "Constraint text the plan is created from." } },
      required: ["constraintsText"],
    },
  },
  {
    name: "spec_refine",
    description: "Refine a named section of the current feature's spec with new content.",
    inputSchema: {
      type: "object" as const,
      properties: { section: { ...STR, description: "Name of the spec section to refine." }, changes: { ...STR, description: "New content for the section." } },
      required: ["section", "changes"],
    },
  },
  {
    name: "artifacts_analyze",
    description: "Report presence and size for named artifacts of the current feature.",
    inputSchema: {
      type: "object" as const,
      properties: { artifacts: { ...STR_ARRAY, description: "Names of the artifacts to analyze." } },
      required: ["artifacts"],
    },
  },
  {
    name: "tasks_generate",
    description: "Generate a numbered checkbox task list for the current feature from its spec.",
    inputSchema: {
      type: "object" as const,
      properties: { scope: { ...STR, description: "Optional scope limiting which tasks are generated." } },
    },
  },
  {
    name: "tasks_tick",
    description: "Mark a task as done in the current feature's task list.",
    inputSchema: {
      type: "object" as const,
      properties: { taskId: { ...STR, description: "Id of the task to mark done." } },
      required: ["taskId"],
    },
  },
  {
    name: "tasks_tick_range",
    description: "Mark several tasks as done in the current feature's task list.",
    inputSchema: {
      type: "object" as const,
      properties: { taskIds: { ...STR_ARRAY, description: "Ids of the tasks to mark done." } },
      required: ["taskIds"],
    },
  },
  {
    name: "tasks_filter",
    description: "List actionable tasks from the current feature, optionally by preset and limit.",
    inputSchema: {
      type: "object" as const,
      properties: { preset: { ...STR, description: "Optional preset selecting the task filter." }, limit: { type: "integer" as const, description: "Maximum number of tasks to list." } },
    },
  },
  {
    name: "tasks_search",
    description: "Search task text in the current feature's task list.",
    inputSchema: {
      type: "object" as const,
      properties: { query: { ...STR, description: "Text to search for in task text." }, fuzzy: { ...BOOL, description: "When true, use fuzzy matching." } },
      required: ["query"],
    },
  },
  {
    name: "tasks_visualize",
    description: "Render the current feature's task list as text or mermaid.",
    inputSchema: {
      type: "object" as const,
      properties: { format: { ...STR, description: "Output format: text or mermaid." } },
    },
  },
  {
    name: "tasks_stats",
    description: "Report done and pending task counts for the current feature.",
    inputSchema: {
      type: "object" as const,
      properties: { groupBy: { ...STR, description: "Grouping key for the task counts." }, includeCharts: { ...BOOL, description: "When true, include chart data in the report." } },
    },
  },
  {
    name: "git_create_branch",
    description: "Create a git branch in the workspace using git.",
    inputSchema: {
      type: "object" as const,
      properties: { branchName: { ...STR, description: "Name of the git branch to create." } },
      required: ["branchName"],
    },
  },
  {
    name: "quality_format",
    description: "Run the formatter check, optionally fixing formatting.",
    inputSchema: {
      type: "object" as const,
      properties: { fix: { ...BOOL, description: "When true, fix formatting instead of only checking." } },
    },
  },
  {
    name: "quality_lint",
    description: "Run the linter, optionally fixing lint issues.",
    inputSchema: {
      type: "object" as const,
      properties: { fix: { ...BOOL, description: "When true, fix lint issues instead of only reporting them." } },
    },
  },
  {
    name: "quality_test",
    description: "Run the test suite, optionally with coverage.",
    inputSchema: {
      type: "object" as const,
      properties: { coverage: { ...BOOL, description: "When true, run the test suite with coverage." } },
    },
  },
  {
    name: "quality_security_audit",
    description: "Run a dependency security audit, optionally fixing findings.",
    inputSchema: {
      type: "object" as const,
      properties: { fix: { ...BOOL, description: "When true, apply fixes for audit findings where possible." } },
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "specforge", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const root = resolveRoot(process.env);
  try {
    let out: unknown;
    switch (name) {
      case "specify_start": out = await specifyStart(root, SpecifyStartArgs.parse(args ?? {})); break;
      case "specify_describe": out = await specifyDescribe(root, SpecifyDescribeArgs.parse(args ?? {}).description); break;
      case "constitution_create": out = await constitutionCreate(root, ConstitutionArgs.parse(args ?? {})); break;
      case "clarify_add": out = await clarifyAdd(root, ClarifyAddArgs.parse(args ?? {})); break;
      case "clarify_resolve": out = await clarifyResolve(root, ClarifyResolveArgs.parse(args ?? {})); break;
      case "spec_validate": out = await specValidate(root, SpecValidateArgs.parse(args ?? {})); break;
      case "research_append": out = await researchAppend(root, ResearchAppendArgs.parse(args ?? {}).content); break;
      case "plan_create": out = await planCreate(root, PlanCreateArgs.parse(args ?? {}).constraintsText); break;
      case "spec_refine": out = await specRefine(root, SpecRefineArgs.parse(args ?? {})); break;
      case "artifacts_analyze": out = await artifactsAnalyze(root, ArtifactsAnalyzeArgs.parse(args ?? {}).artifacts); break;
      case "tasks_generate": out = await tasksGenerate(root, TasksGenerateArgs.parse(args ?? {}).scope); break;
      case "tasks_tick": out = await tasksTick(root, TasksTickArgs.parse(args ?? {}).taskId); break;
      case "tasks_tick_range": out = await tasksTickRange(root, TasksTickRangeArgs.parse(args ?? {}).taskIds); break;
      case "tasks_filter": out = await tasksFilter(root, TasksFilterArgs.parse(args ?? {})); break;
      case "tasks_search": out = await tasksSearch(root, TasksSearchArgs.parse(args ?? {})); break;
      case "tasks_visualize": out = await tasksVisualize(root, TasksVisualizeArgs.parse(args ?? {})); break;
      case "tasks_stats": out = await tasksStats(root, TasksStatsArgs.parse(args ?? {})); break;
      case "git_create_branch": out = await gitCreateBranch(root, GitCreateBranchArgs.parse(args ?? {}).branchName); break;
      case "quality_format": out = await qualityFormat(root, QualityFormatArgs.parse(args ?? {}).fix ?? false); break;
      case "quality_lint": out = await qualityLint(root, QualityLintArgs.parse(args ?? {}).fix ?? false); break;
      case "quality_test": out = await qualityTest(root, QualityTestArgs.parse(args ?? {}).coverage ?? false); break;
      case "quality_security_audit": out = await qualitySecurityAudit(root, QualityAuditArgs.parse(args ?? {}).fix ?? false); break;
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
