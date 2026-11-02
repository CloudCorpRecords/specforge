# specforge — Build Report

MCP Rebuild 1000. Clean-room rebuild of flight505/MCP_DinCoder
(MCP Registry rank 192, 2 stars), built from the public README
spec captured in
`harness/fixtures/MCP_DinCoder-tools-original.json`. That fixture
is docs-derived: the tools are the full documented set of 22 from
the original's README "Available Tools" table and the argument
schemas come from the table's usage examples — no original
server was probed. Parity proves the rebuild matches this
program's defined spec, labelled docs-derived. Local build
only — nothing pushed or published.

**Scope note:** `clarify_list` and `artifacts_read` are
mentioned in the original's prose but are NOT in its tools
table. They are deliberately not built; this is recorded in the
fixture `_source` and above.

Identity: repo `specforge`, npm `@reneturcios/specforge`,
MCP name `io.github.CloudCorpRecords/specforge`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `specforge: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Spec-driven development locally:
  specs, constitutions, plans, tasks, git and quality checks."
  = **92 chars** (≤100 ✓); npm entry carries `version: 0.1.0`;
  OCI entry `ghcr.io/cloudcorprecords/specforge:0.1.0` carries
  **no** `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/specforge"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (subcommands mirror the tool
  names, plus `mcp` and `--version`; exit 2 usage / 1 tool error),
  `src/mcp.ts`, `src/types.ts`, `src/specforge.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/specforge.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to specforge)

## Tools implemented (22)

`specify_start`, `specify_describe`, `constitution_create`,
`clarify_add`, `clarify_resolve`, `spec_validate`,
`research_append`, `plan_create`, `spec_refine`,
`artifacts_analyze`, `tasks_generate`, `tasks_tick`,
`tasks_tick_range`, `tasks_filter`, `tasks_search`,
`tasks_visualize`, `tasks_stats`, `git_create_branch`,
`quality_format`, `quality_lint`, `quality_test`,
`quality_security_audit` — the full documented set of 22 as
recorded in the fixture `_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- The workspace root comes from `SPECFORGE_ROOT` (default: the
  process working directory). Each feature is a numbered
  directory `specs/<NNN>-<slug>/` holding `constitution.md`,
  `spec.md`, `plan.md`, `tasks.md`, `research.md`,
  `clarifications.json` and a `contracts/` directory. The
  "current feature" is the highest-numbered feature directory;
  tools that need one error honestly when none exists.
- Filesystem behaviour is real local logic: `specify_start`
  creates the next numbered directory with a spec template,
  `contracts/` and `research.md`; clarifications are stored as a
  JSON array with `CLARIFY-NNN` ids and `resolution: null` until
  resolved; tasks are a numbered checkbox list (`T-NNN`) derived
  from the spec's bullet lines (with a documented default set
  when the spec yields none); `spec_validate` returns per-check
  results (spec presence/non-empty, user-story section present
  and filled, clarifications valid, contracts present) and
  honours a `checks` subset.
- `git_create_branch` and the four `quality_*` tools run through
  an injectable `Executor` (types.ts). Documented commands:
  `git checkout -b <branch>`; format = `npx prettier --check .`
  (`--write` with fix); lint = `npx eslint .` (`--fix` with
  fix); test = `npm test` (`-- --coverage` with coverage);
  audit = `npm audit` (`npm audit fix` with fix). A non-zero
  exit surfaces as an error naming the tool, exit code and
  stderr — never as success. Tests use a fake executor only; no
  live git/prettier/eslint/npm run is claimed.

## Verification (foreground, exact outputs)

### 1. Build
```
$ npm run build   (tsc)
tsc exit=0
```
`dist/` produced, including `dist/cli.js`. (One initial compile
error in the default executor's stdout narrowing was fixed and
the build re-run clean.)

### 2. Tests
```
$ npm test   (tsx --test test/*.test.ts)
ℹ tests 25
ℹ pass 25
ℹ fail 0
```
Covers: root resolution and slugify; specify_start structure,
numbering increments and current-feature selection; honest
no-current-feature errors; specify_describe writing the User
Stories section; constitution content and the empty-principles
rejection; spec_refine replace/append; clarify add/resolve
round-trip through clarifications.json (ids, null resolution,
unknown-id error); spec_validate per-check results before and
after describing/clarifying, checks subset and unknown check;
research append and plan content; artifacts presence/size
including a missing artifact; task generation from spec bullets
and the default fallback; tick, tick-range (with missing ids),
filter presets + limit + unknown preset, search substring and
fuzzy subsequence, visualize text/mermaid/unknown format, stats
counts/groups/chart; task tools erroring when tasks.md is
absent; git branch via a fake executor (exact command/args/cwd)
and its failure path (exit 128 surfaces as an error); all four
quality tools' documented commands via a fake executor, and
failing quality commands surfacing as errors.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage. A CLI round-trip in a temp `SPECFORGE_ROOT`
(`specify_start` → `tasks_generate`) produced feature
`001-smoke-test` and 3 generated tasks. MCP `initialize` over
stdio → `serverInfo: {"name":"specforge","version":"0.1.0"}`;
`tools/list` returned 22 tools.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/MCP_DinCoder-tools-original.json \
    --rebuild "stdio:node .../builds/specforge/dist/cli.js mcp" \
    --out /tmp/specforge-parity
verdict=PASS parity_pct=100.0 original_tools=22 rebuild_tools=22 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 22/22.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error. The passing run wrote
to /tmp and its parity.json/parity.md were copied into
`parity-out/` and verified non-empty (1887 and 1370 bytes).

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified
after generation — parses as JSON, top-level `name` is
`@reneturcios/specforge`, version `0.1.0`, `lockfileVersion` 3,
128 package entries — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (sociallens) used only
for the local build/test; it is not part of the lockfile
generation.

## Gaps / honest notes

- Docs-derived spec: argument names are taken from the original
  README table's usage examples as given in the task spec; no
  original MCP_DinCoder server was probed, so parity proves the
  rebuild matches this program's defined spec, not a hand-probed
  original.
- `spec_validate`'s check set, `tasks_generate`'s derivation
  rule (spec bullet lines, else a default three-task set),
  fuzzy search semantics (substring, else per-token
  substring/subsequence) and the mermaid rendering are this
  rebuild's documented interpretations of the one-line tool
  descriptions.
- Executor-backed tools are fake-executor tested only: the real
  execFile path is exercised only insofar as a failing/missing
  command produces exit ≠ 0 and an honest error. No live git
  branch creation or quality run is claimed.
- `clarify_list` / `artifacts_read` intentionally not built
  (prose-only in the original; see the scope note above).
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
