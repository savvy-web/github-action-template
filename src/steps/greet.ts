/**
 * Step: compose the greeting.
 *
 * @remarks
 * The step contract every module under `steps/` follows: a result type, a
 * tagged error with a `reason` literal union WHEN the step can actually fail,
 * and an explicitly annotated `R`. This step is infallible — its inputs are
 * validated before it runs — so it declares NO error class: an error type
 * exists only if the step constructs it (the mirror rule).
 *
 * Failure posture: n/a (cannot fail).
 *
 * @module steps/greet
 */

import { Effect } from "effect";
import { formatGreeting } from "../format.js";
import type { Inputs } from "../schema/inputs.js";

/**
 * What the greet step learned.
 */
export interface GreetResult {
	readonly greeting: string;
}

/**
 * Composes the greeting and logs the detect-headline: WHAT was decided at
 * info, so the log carries the decision even when nothing else runs.
 */
export const greet = (inputs: Inputs): Effect.Effect<GreetResult> =>
	Effect.gen(function* () {
		const greeting = formatGreeting(inputs.name, inputs.emphatic);
		yield* Effect.logInfo(`Greeting composed: ${greeting}`);
		return { greeting };
	});
