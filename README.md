# specforge

specforge is a local tool for spec-driven development. It keeps a
`specs/` tree in a workspace: every feature gets a numbered
directory holding its spec, constitution, plan, task list,
research notes, clarifications and contracts, and specforge
creates and maintains those files. It can also create a git
branch and run format, lint, test and security-audit checks.
One binary serves a command-line interface and a stdio MCP
server; nothing here talks to a network service.

The workspace root is taken from the `SPECFORGE_ROOT`
environment variable, defaulting to the current working
directory. The "current feature" that most tools operate on is
the highest-numbered directory under `specs/`; tools that need
one fail with an error when no feature exists yet.

## Install

```bash
npx @reneturcios/specforge specify_start --project-name "My Feature"
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/specforge
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

The subcommands mirror the MCP tool names:

```bash
export SPECFORGE_ROOT=/path/to/workspace

specforge specify_start --project-name "Widget API" --agent claude
specforge specify_describe --description "As a user I can create widgets."
specforge constitution_create --principles "Ship small,Test first" --constraints "Node 20"
specforge clarify_add --question "Which database?" --context storage
specforge clarify_resolve --clarification-id CLARIFY-001 --resolution Postgres
specforge spec_validate
specforge research_append --content "Evaluated two libraries; picked the smaller one."
specforge plan_create --constraints-text "Must ship by Friday."
specforge spec_refine --section Requirements --changes "- Must be fast"
specforge artifacts_analyze --artifacts spec,plan,tasks,contracts
specforge tasks_generate --scope backend
specforge tasks_tick --task-id T-001
specforge tasks_tick_range --task-ids T-002,T-003
specforge tasks_filter --preset actionable --limit 5
specforge tasks_search --query widget --fuzzy true
specforge tasks_visualize --format mermaid
specforge tasks_stats --include-charts true
specforge git_create_branch --branch-name feature/widgets
specforge quality_format
specforge quality_lint --fix true
specforge quality_test --coverage true
specforge quality_security_audit

specforge --version
```

Results print as JSON. Exit codes: `0` on success, `1` when a
tool fails (for example there is no current feature, or the
underlying git/quality command exits non-zero), `2` for usage
errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio
MCP server:

```bash
npx -y @reneturcios/specforge mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "specforge": {
      "command": "npx",
      "args": ["-y", "@reneturcios/specforge", "mcp"],
      "env": { "SPECFORGE_ROOT": "/path/to/workspace" }
    }
  }
}
```

### Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `specify_start` | `projectName` (required), `agent` | Create the next numbered feature directory with a spec template, `contracts/` and `research.md`. |
| `specify_describe` | `description` (required) | Write the description into the current feature's spec user-story section. |
| `constitution_create` | `principles` (required), `constraints`, `preferences` | Write `constitution.md` for the current feature. |
| `clarify_add` | `question` (required), `context` | Append a clarification (`CLARIFY-NNN`, resolution `null`) to `clarifications.json`. |
| `clarify_resolve` | `clarificationId`, `resolution` (both required) | Set the resolution for a clarification. |
| `spec_validate` | `checks` (optional object) | Check the spec's presence and completeness; returns per-check results. |
| `research_append` | `content` (required) | Append to `research.md`. |
| `plan_create` | `constraintsText` (required) | Write `plan.md` from the constraints. |
| `spec_refine` | `section`, `changes` (both required) | Replace or add a named section in `spec.md`. |
| `artifacts_analyze` | `artifacts` (required array) | Report presence and size of named artifacts. |
| `tasks_generate` | `scope` (optional) | Generate `tasks.md`, a numbered checkbox list derived from the spec. |
| `tasks_tick` | `taskId` (required) | Mark a task `T-NNN` done. |
| `tasks_tick_range` | `taskIds` (required array) | Mark several tasks done; missing ids are reported. |
| `tasks_filter` | `preset`, `limit` (optional) | List tasks; the default preset is the actionable (unchecked) ones. |
| `tasks_search` | `query` (required), `fuzzy` | Search task text; fuzzy matching also accepts subsequences. |
| `tasks_visualize` | `format` (optional) | Render the task list as `text` (default) or `mermaid`. |
| `tasks_stats` | `groupBy`, `includeCharts` (optional) | Count done and pending tasks, optionally with a text chart. |
| `git_create_branch` | `branchName` (required) | Run `git checkout -b <branchName>` in the workspace. |
| `quality_format` | `fix` (optional) | Run the Prettier check, or `--write` with `fix`. |
| `quality_lint` | `fix` (optional) | Run ESLint, or with `--fix`. |
| `quality_test` | `coverage` (optional) | Run `npm test`, optionally with coverage. |
| `quality_security_audit` | `fix` (optional) | Run `npm audit`, or `npm audit fix` with `fix`. |

The git and quality tools report an error result when the
underlying command is unavailable or exits non-zero; they never
report success for a command that did not run cleanly.

Note: the original project's prose also mentions `clarify_list`
and `artifacts_read`, but they do not appear in its documented
tools table, so they are not part of this rebuild.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, temp dirs and a fake executor, no network
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
