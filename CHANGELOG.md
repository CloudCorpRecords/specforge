# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI subcommands mirror the MCP tools, plus `specforge mcp`
  and `--version`.
- MCP server (`specforge mcp`, stdio) with the full documented
  tool set: feature start/describe, constitutions, clarifications,
  spec validation and refinement, research, plans, artifact
  analysis, task generation/ticking/filtering/search/visualisation
  and stats, git branch creation, and format/lint/test/security
  quality checks.
- All work happens locally under a `specs/` tree rooted at
  `SPECFORGE_ROOT` (default: the working directory); the current
  feature is the highest-numbered feature directory.
- Git and quality commands run through an injectable executor,
  so the test suite uses a fake executor and temp directories
  with no live subprocess claims.
