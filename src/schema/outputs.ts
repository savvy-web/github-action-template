import type { ActionOutputError } from "@effected/github-actions";
import { ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";
import { RunResult, toRunResult } from "./result.js";

/**
 * The `action.yml` output names, verbatim, as a const tuple.
 *
 * @remarks
 * The counterpart to `INPUT_NAMES`; the suite parses `action.yml` and
 * records what {@link emitOutputs} actually writes, and both must equal this
 * list.
 */
export const OUTPUT_NAMES = ["greeting", "result"] as const;

/**
 * A single `action.yml` output name.
 */
export type OutputName = (typeof OUTPUT_NAMES)[number];

/**
 * The fully-typed shape of all `action.yml` outputs.
 *
 * @remarks
 * This is the action's INTERNAL model, not its published contract: the
 * structured `result` output is `schema/result.ts`'s {@link RunResult}, and
 * `toRunResult` is the one projection between them. Keeping the two apart is
 * what lets this model change shape without moving a contract downstream
 * consumers pin.
 */
export interface OutputsModel {
	readonly greeting: string;
	readonly summaryWritten: boolean;
	readonly dryRun: boolean;
}

/**
 * All-disabled defaults: the baseline a run starts from before any step
 * contributes.
 *
 * @remarks
 * Emitted FIRST, before any work — see `program.ts` — so every declared output
 * has a value even if the run aborts in `readInputs`. The pipeline then FOLDS
 * step results over this baseline, so a step that did not run reports its
 * default rather than being absent.
 */
export const initialOutputs: OutputsModel = {
	greeting: "",
	summaryWritten: false,
	dryRun: false,
};

/**
 * Publishes every `action.yml` output exactly once.
 *
 * @remarks
 * `greeting` is a flat string via `set`; `result` is the structured contract
 * via `setJson`, which takes the schema as its ENCODER — the same `RunResult`
 * value `lib/scripts/generate-schema.ts` publishes a JSON Schema document
 * from, so the emitted payload and the committed document cannot disagree.
 */
export const emitOutputs = (model: OutputsModel): Effect.Effect<void, ActionOutputError, ActionOutputs> =>
	Effect.gen(function* () {
		const outputs = yield* ActionOutputs;
		yield* outputs.set("greeting", model.greeting);
		yield* outputs.setJson("result", toRunResult(model), RunResult);
	});
