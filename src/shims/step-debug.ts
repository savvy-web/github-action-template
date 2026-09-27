/**
 * Shim: honour the runner's step-debug switch in the ambient log level.
 *
 * @remarks
 * `ActionEnvironment.isDebug` answers whether step debugging is on
 * (`RUNNER_DEBUG === "1"`), but nothing in the kit acts on the answer: core's
 * `References.MinimumLogLevel` defaults to `"Info"`, so every `Effect.logDebug`
 * is filtered before `ActionLogger` can render it as `::debug::` — even on a
 * re-run with debug logging enabled.
 *
 * - **Checked absent:** `@effected/github-actions@0.17.0` — neither
 *   `Action.run`, `ActionRuntime.layer` nor `ActionLogger` reads `isDebug`
 *   into `MinimumLogLevel` (`ActionLogger.withBuffer` sets its own level
 *   inside a buffer only).
 * - **Upstream:** https://github.com/spencerbeggs/effected/issues/853 —
 *   tracked here in https://github.com/savvy-web/github-action-template/issues/113.
 * - **Removal condition:** `Action.run` (or `ActionLogger`) lowers the minimum
 *   level on step debug itself. Delete this module and the two call sites
 *   (`program.ts`, `post.ts`).
 *
 * Applied ONCE per phase, at the top of each phase's program — the level is a
 * run-wide setting, never a per-step decision.
 *
 * @module shims/step-debug
 */

import { ActionEnvironment } from "@effected/github-actions";
import { Effect, References } from "effect";

/**
 * Runs `effect` at `Debug` minimum log level when the runner is in step-debug
 * mode, and at `Info` otherwise.
 */
export const withStepDebug = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | ActionEnvironment> =>
	Effect.gen(function* () {
		// `isDebug` is a MEMBER of the service, not a static accessor: resolve
		// the service, then read it.
		const environment = yield* ActionEnvironment;
		const debug = yield* environment.isDebug;
		return yield* effect.pipe(Effect.provideService(References.MinimumLogLevel, debug ? "Debug" : "Info"));
	});
