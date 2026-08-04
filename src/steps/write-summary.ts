/**
 * Step: append the greeting panel to the job summary.
 *
 * @remarks
 * Failure posture: degrade-to-warning. A summary is a report ABOUT a run that
 * already happened — failing the job over one would discard work that
 * succeeded. The tagged error is "the shape a failure takes before it is
 * logged": constructed, logged as a warning with its tag and reason, and
 * never raised past this module, so the step's error channel is honestly
 * `never`.
 *
 * The mutation goes through `DryRun.guard`, so a rehearsal run reports the
 * skip and writes nothing.
 *
 * @module steps/write-summary
 */

import { ActionOutputs, DryRun } from "@effected/github-actions";
import { Data, Effect } from "effect";
import { buildSummaryPanel, formatSkipped } from "../format.js";
import type { Inputs } from "../schema/inputs.js";
import type { OutputsModel } from "../schema/outputs.js";

/**
 * Raised (shaped, then logged — never raised past this module) when the
 * runner refuses the `GITHUB_STEP_SUMMARY` write.
 */
export class SummaryWriteError extends Data.TaggedError("SummaryWriteError")<{
	readonly reason: "write-failed";
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * What the write-summary step did.
 */
export interface WriteSummaryResult {
	readonly written: boolean;
}

/**
 * Appends the greeting panel to the job summary, unless the `write-summary`
 * input disabled it (logged as `Step: … — SKIPPED: …`), the run is a
 * rehearsal (`DryRun.guard` skips the mutation), or the write fails (degraded
 * to a warning).
 */
export const writeSummary = (params: {
	readonly inputs: Inputs;
	readonly outputs: OutputsModel;
}): Effect.Effect<WriteSummaryResult, never, ActionOutputs | DryRun> =>
	Effect.gen(function* () {
		if (!params.inputs.writeSummary) {
			yield* Effect.logInfo(formatSkipped("Write job summary", "disabled by the write-summary input"));
			return { written: false };
		}
		const outputs = yield* ActionOutputs;
		const dryRun = yield* DryRun;
		const write = outputs.summary(buildSummaryPanel(params.outputs)).pipe(
			Effect.as(true),
			Effect.mapError(
				(cause) =>
					new SummaryWriteError({
						reason: "write-failed",
						message: String(cause),
						cause,
					}),
			),
		);
		const written = yield* dryRun
			.guard("append the greeting panel to the job summary", write, false)
			.pipe(
				Effect.catch((error) =>
					Effect.logWarning(`Job summary degraded to a warning [${error._tag}/${error.reason}]: ${error.message}`).pipe(
						Effect.as(false),
					),
				),
			);
		return { written };
	});
