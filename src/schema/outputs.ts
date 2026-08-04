import type { ActionOutputError } from "@effected/github-actions";
import { ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";

/**
 * The `action.yml` output names, verbatim, as a const tuple.
 *
 * @remarks
 * The counterpart to `INPUT_NAMES`; the suite parses `action.yml` and
 * records what {@link emitOutputs} actually writes, and both must equal this
 * list.
 */
export const OUTPUT_NAMES = ["greeting", "summary-written"] as const;

/**
 * A single `action.yml` output name.
 */
export type OutputName = (typeof OUTPUT_NAMES)[number];

/**
 * The fully-typed shape of all `action.yml` outputs.
 */
export interface OutputsModel {
	readonly greeting: string;
	readonly summaryWritten: boolean;
}

/**
 * All-disabled defaults: the baseline a run starts from before any step
 * contributes.
 *
 * @remarks
 * The pipeline FOLDS step results over this baseline, so a step that did not
 * run reports its default rather than being absent — and the failure path
 * emits exactly this value, so downstream steps always see every declared
 * output.
 */
export const initialOutputs: OutputsModel = {
	greeting: "",
	summaryWritten: false,
};

/**
 * Publishes every `action.yml` output exactly once, via `ActionOutputs.set`.
 *
 * @remarks
 * Called on every exit path — success emits the folded model, failure emits
 * {@link initialOutputs} — so a consuming workflow can always read every
 * declared output. Booleans render with `String(v)` (`"true"` / `"false"`).
 */
export const emitOutputs = (model: OutputsModel): Effect.Effect<void, ActionOutputError, ActionOutputs> =>
	Effect.gen(function* () {
		const outputs = yield* ActionOutputs;
		yield* outputs.set("greeting", model.greeting);
		yield* outputs.set("summary-written", String(model.summaryWritten));
	});
