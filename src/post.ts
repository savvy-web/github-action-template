/**
 * Post entry point: report duration, then get out of the way.
 *
 * @remarks
 * Runs after `main`, even when `main` failed. Post-phase failures must NEVER
 * fail the workflow: the whole program sits under a `catch` + `catchDefect`
 * double net that demotes anything — a typed state error or a bug here — to
 * a warning. Cleanup that must always happen (token revocation, detached
 * process reaping) belongs on the same terms.
 *
 * @module post
 */

import { Action, ActionState } from "@effected/github-actions";
import { Effect, Option } from "effect";
import { formatDurationLine } from "./format.js";
import { STATE_KEYS, StartTimeState } from "./state.js";

/**
 * The post-phase program, exported for tests.
 */
export const post: Effect.Effect<void, never, ActionState> = Effect.gen(function* () {
	const state = yield* ActionState;
	yield* Effect.logDebug("Running post-action script");

	const started = yield* state.getOptional(STATE_KEYS.startTime, StartTimeState);
	if (Option.isSome(started)) {
		yield* Effect.logInfo(formatDurationLine(Date.now() - started.value.startedAt));
	} else {
		yield* Effect.logDebug("No start time recorded; skipping the duration report");
	}
}).pipe(
	// Double net: a typed failure OR a defect in post demotes to a warning.
	Effect.catch((error) => Effect.logWarning(`Post-action warning: ${String(error)}`)),
	Effect.catchDefect((defect) => Effect.logWarning(`Post-action warning: ${String(defect)}`)),
);

/* v8 ignore next 3 -- entry-point guard, only runs inside a GitHub Actions runner */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(post);
}
