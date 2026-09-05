/**
 * The single rendering surface: every human-readable string this action emits
 * — log lines, the run-context block, the closing result block and the job
 * summary panel — is built here, pure and service-free.
 *
 * The invariant: a fact that appears both in the workflow log and in the job
 * summary goes through the SAME function ({@link formatGreeting}), so the two
 * surfaces cannot disagree. Markdown is assembled with the kit's
 * `GitHubMarkdown` (escaping, not string-joins) — never a hand-rolled
 * markdown helper.
 *
 * @module format
 */

import { GitHubMarkdown } from "@effected/github-actions";
import type { Inputs } from "./schema/inputs.js";
import type { OutputsModel } from "./schema/outputs.js";

/**
 * The greeting, rendered once for every surface that shows it.
 */
export const formatGreeting = (name: string, emphatic: boolean): string => `Hello, ${name}${emphatic ? "!" : "."}`;

/**
 * The run-context block: what this run was asked to do, logged before any
 * work happens so a failed run still shows its configuration.
 */
export const runContextLines = (inputs: Inputs): ReadonlyArray<string> => [
	"Run context:",
	`  name: ${inputs.name}`,
	`  emphatic: ${inputs.emphatic}`,
	`  write-summary: ${inputs.writeSummary}`,
	`  dry-run: ${inputs.dryRun}`,
];

/**
 * The closing result block: what actually happened, as the last thing the
 * log says.
 */
export const resultLines = (outputs: OutputsModel): ReadonlyArray<string> => [
	"Result:",
	`  greeting: ${outputs.greeting}`,
	`  summary-written: ${outputs.summaryWritten}`,
	`  dry-run: ${outputs.dryRun}`,
];

/**
 * The one `Step: X — SKIPPED: reason` shape every skipped step logs, so the
 * log stays a machine-greppable decision record.
 */
export const formatSkipped = (step: string, reason: string): string => `Step: ${step} — SKIPPED: ${reason}`;

/**
 * The job summary panel.
 *
 * @remarks
 * Built on `GitHubMarkdown` so cell content is escaped; the greeting cell
 * reuses {@link formatGreeting}'s output verbatim (the caller passes the
 * already-rendered model), which is what keeps the panel and the log line
 * identical.
 */
export const buildSummaryPanel = (outputs: OutputsModel): string =>
	[
		GitHubMarkdown.heading("Greeting Report"),
		GitHubMarkdown.table(["Fact", "Value"], [["Greeting", GitHubMarkdown.code(outputs.greeting)]]),
	].join("\n\n");

/**
 * The post-phase duration line.
 */
export const formatDurationLine = (elapsedMs: number): string =>
	`Action completed in ${(elapsedMs / 1000).toFixed(2)}s`;
