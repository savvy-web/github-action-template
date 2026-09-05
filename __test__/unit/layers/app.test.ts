import { assert, describe, it } from "@effect/vitest";
import type { ActionServices } from "@effected/github-actions";
import type { Effect, Layer } from "effect";
import { makeAppLayer } from "../../../src/layers/app.js";
import type { program } from "../../../src/program.js";

/**
 * The requirement-channel proof for this action's layers.
 *
 * **The teeth are at COMPILE time.** The `it.effect` bodies below only keep the
 * suite honest that this module was evaluated; a runtime assertion would be no
 * proof at all, because it can regress silently while a compile error cannot.
 *
 * `Action.run` is typed
 * `<E, R = never>(program: Effect<void, E, ActionServices | R>, options?: ActionRunOptions<R>)`.
 * Because `options` is optional, `R` infers to whatever the program still
 * requires and NOTHING forces a layer to be passed — so a program that resolves
 * a service nobody provides typechecks cleanly and dies on the runner as a
 * defect, before it logs anything useful.
 *
 * The proof is TWO-SIDED, and the second half is not a restatement of the
 * first. Both halves have shipped as production deaths under a clean typecheck
 * and a green suite:
 *
 * 1. The LAYER's input channel — what `makeAppLayer` still needs from its
 *    caller. A layer body that resolves a service the composition never
 *    provides lands here.
 * 2. The PROGRAM's requirement channel — what is left after `program` provides
 *    its own layers internally. A service resolved inside a STEP's body is a
 *    method-level requirement: it never enters any layer's input channel, so
 *    assertion 1 is structurally blind to it. Worse, a unit suite can be blind
 *    too, because a composition harness that supplies its own test layer is
 *    MORE capable than production — a double more complete than the real thing
 *    hides exactly the wiring bug it appears to exercise.
 */

type RequirementsOfLayer<L> = L extends Layer.Layer<infer _Out, infer _E, infer In> ? In : never;
type RequirementsOfEffect<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

/** Everything `makeAppLayer` still needs from its caller. */
type AppLayerRequirements = RequirementsOfLayer<ReturnType<typeof makeAppLayer>>;

/** What `program` still needs after providing `makeAppLayer` internally. */
type ProgramRequirements = RequirementsOfEffect<typeof program>;

/**
 * Both MUST be `never`. When one is not, the annotation resolves to the
 * leftover service type, `true` stops being assignable to it, and the compiler
 * error NAMES the missing service.
 */
type UnsatisfiedLayerRequirements = Exclude<AppLayerRequirements, ActionServices>;
type UnsatisfiedProgramRequirements = Exclude<ProgramRequirements, ActionServices>;

const _layerNeedsNothingBeyondActionRun: [UnsatisfiedLayerRequirements] extends [never]
	? true
	: UnsatisfiedLayerRequirements = true;

const _programNeedsNothingBeyondActionRun: [UnsatisfiedProgramRequirements] extends [never]
	? true
	: UnsatisfiedProgramRequirements = true;

describe("makeAppLayer", () => {
	it("requires nothing beyond ActionServices", () => {
		assert.isTrue(_layerNeedsNothingBeyondActionRun);
		assert.isDefined(makeAppLayer(true));
	});
});

describe("program", () => {
	it("resolves nothing beyond ActionServices, including inside step bodies", () => {
		// Catches the class the layer-side assertion structurally cannot: a
		// service resolved in a step METHOD, which never enters a layer's input
		// channel at all.
		assert.isTrue(_programNeedsNothingBeyondActionRun);
	});
});
