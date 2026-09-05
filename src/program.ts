/**
 * The main-phase program: pure composition.
 *
 * @remarks
 * This module holds ONLY the pipeline — inputs, steps in order, the output
 * fold and the closing report. No I/O of its own, no formatting (that is
 * `format.ts`), no step bodies (those are `steps/*`). It is exported so
 * tests can run it against test layers without module-level execution; the
 * entry points (`main.ts`) do nothing but guard and run it.
 *
 * The logging contract: a run-context block first, every skipped step says
 * `Step: X — SKIPPED: <reason>`, warnings are reserved for acceptance
 * signals, and a closing result block reports what happened. The suite
 * asserts on the captured log stream — the log IS the decision record.
 *
 * @module program
 */

import type { ActionOutputError, ActionOutputs, ActionStateError, DryRun } from "@effected/github-actions";
import { ActionLogger, ActionState } from "@effected/github-actions";
import type { Config } from "effect";
import { Effect } from "effect";
import { resultLines, runContextLines } from "./format.js";
import { makeAppLayer } from "./layers/app.js";
import type { InputError, Inputs } from "./schema/inputs.js";
import { readInputs } from "./schema/inputs.js";
import type { OutputsModel } from "./schema/outputs.js";
import { emitOutputs, initialOutputs } from "./schema/outputs.js";
import { STATE_KEYS, StartTimeState } from "./state.js";
import { greet } from "./steps/greet.js";
import { writeSummary } from "./steps/write-summary.js";

/**
 * The steps, in runner order, each inside a collapsible log group, folded
 * into the published outputs from the all-disabled baseline.
 */
const pipeline = (inputs: Inputs): Effect.Effect<OutputsModel, never, ActionLogger | ActionOutputs | DryRun> =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		const greeted = yield* logger.group("Greet", greet(inputs));
		const summary = yield* logger.group(
			"Write job summary",
			writeSummary({ inputs, outputs: { ...initialOutputs, greeting: greeted.greeting } }),
		);
		// The fold: start from all-disabled defaults so a step that did not run
		// reports its default rather than being absent.
		return {
			...initialOutputs,
			greeting: greeted.greeting,
			summaryWritten: summary.written,
			dryRun: inputs.dryRun,
		};
	});

/**
 * The main-phase program `Action.run` executes.
 *
 * @remarks
 * **The output baseline is emitted FIRST, before any work** — before
 * `readInputs`, which is the earliest thing that can abort the run — so every
 * declared output has a value on every exit path. Later writes only ever
 * refine it.
 *
 * Emitting up front rather than from an `Effect.onError` handler is
 * deliberate, and the `onError` form is a recorded anti-pattern this module
 * used to carry: a failure handler that re-emits the baseline also OVERWRITES
 * anything a step already published, so a run that did consumer-visible work
 * and then failed later would report the all-disabled defaults — not a
 * conservative fallback, a false statement about work that actually happened.
 * The residual gap (an unexpected failure between steps, after one of them did
 * externally-visible work) is closed AT THE STEP: a step whose result must
 * survive a later failure emits its own output as soon as it lands. This
 * template's only mutation is the job summary, which nothing downstream reads
 * back, so the single closing write is sufficient here.
 *
 * Failure still fails the effect — never `setFailed`-and-return — so the job's
 * verdict comes from the error channel, rendered by `Action.run`.
 */
export const program: Effect.Effect<
	void,
	InputError | Config.ConfigError | ActionStateError | ActionOutputError,
	ActionLogger | ActionOutputs | ActionState
> = Effect.gen(function* () {
	// The all-disabled baseline, BEFORE any work — including before the inputs
	// are read. See the remarks above for why this is not an `onError` handler.
	yield* emitOutputs(initialOutputs);

	const inputs = yield* readInputs;
	const state = yield* ActionState;

	// Run-context block: what this run was asked to do, before any work.
	for (const line of runContextLines(inputs)) {
		yield* Effect.logInfo(line);
	}

	// Cross-phase state: `post` reports duration from this.
	yield* state.save(STATE_KEYS.startTime, new StartTimeState({ startedAt: Date.now() }), StartTimeState);

	const outputs = yield* pipeline(inputs).pipe(Effect.provide(makeAppLayer(inputs.dryRun)));

	yield* emitOutputs(outputs);

	// Closing result block: the last thing the log says.
	for (const line of resultLines(outputs)) {
		yield* Effect.logInfo(line);
	}
});
