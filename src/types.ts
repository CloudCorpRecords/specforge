/**
 * specforge types.
 *
 * A workspace root holds a specs/ tree; each feature is a numbered
 * directory specs/<NNN>-<slug>/ with spec.md, constitution.md,
 * plan.md, tasks.md, research.md, clarifications.json and a
 * contracts/ directory. External commands (git and the quality
 * tools) go through an injectable Executor so tests can substitute
 * a fake and never run a real subprocess.
 */

export interface Clarification {
  id: string;
  question: string;
  context: string | null;
  resolution: string | null;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ArtifactReport {
  name: string;
  path: string;
  exists: boolean;
  size: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FeatureInfo {
  name: string;
  number: number;
  slug: string;
  dir: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Injectable command executor: runs command + args in cwd. */
export type Executor = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<ExecResult>;

export interface SpecifyStartOptions {
  projectName: string;
  agent?: string;
}

export interface ConstitutionOptions {
  principles: string[];
  constraints?: string[];
  preferences?: string[];
}

export interface ClarifyAddOptions {
  question: string;
  context?: string;
}

export interface ClarifyResolveOptions {
  clarificationId: string;
  resolution: string;
}

export interface SpecValidateOptions {
  checks?: Record<string, unknown>;
}

export interface SpecRefineOptions {
  section: string;
  changes: string;
}

export interface TasksFilterOptions {
  preset?: string;
  limit?: number;
}

export interface TasksSearchOptions {
  query: string;
  fuzzy?: boolean;
}

export interface TasksVisualizeOptions {
  format?: string;
}

export interface TasksStatsOptions {
  groupBy?: string;
  includeCharts?: boolean;
}

export interface QualityResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}
