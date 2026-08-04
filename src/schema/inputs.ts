import { ActionInput } from "@effected/github-actions";
import { Config, Data, Effect } from "effect";

/**
 * The `action.yml` input names, verbatim, as a const tuple.
 *
 * @remarks
 * Names-as-data: this tuple is what makes "the code and `action.yml` declare
 * the same inputs" a test rather than a convention. The suite parses
 * `action.yml` for real, records what {@link readInputs} actually asks the
 * config provider for, and both must equal this list.
 */
export const INPUT_NAMES = ["name", "emphatic", "write-summary", "dry-run"] as const;

/**
 * A single `action.yml` input name.
 */
export type InputName = (typeof INPUT_NAMES)[number];

/**
 * The fully decoded, typed shape of all `action.yml` inputs.
 */
export interface Inputs {
	readonly name: string;
	readonly emphatic: boolean;
	readonly writeSummary: boolean;
	readonly dryRun: boolean;
}

/**
 * Raised when the decoded inputs fail cross-field or content validation.
 *
 * @remarks
 * Fail-the-job tier: a workflow that supplied unusable inputs should stop
 * before any work happens, with a typed error naming the input. Only reasons
 * with a real constructor site exist — do not add speculative members.
 */
export class InputError extends Data.TaggedError("InputError")<{
	readonly reason: "blank-name";
	readonly message: string;
}> {}

/**
 * The raw decode of every input, via `ActionInput` accessors so `INPUT_`
 * mangling and empty-string-is-absent semantics stay owned by
 * `@effected/github-actions`, not reimplemented here.
 *
 * @remarks
 * Defaults mirror `action.yml` — that file is the single source of truth,
 * and the sync test keeps this mirror honest.
 */
const loadInputs: Config.Config<Inputs> = Config.all({
	name: ActionInput.string("name").pipe(Config.withDefault("world")),
	emphatic: ActionInput.boolean("emphatic").pipe(Config.withDefault(false)),
	writeSummary: ActionInput.boolean("write-summary").pipe(Config.withDefault(true)),
	dryRun: ActionInput.boolean("dry-run").pipe(Config.withDefault(false)),
});

/**
 * Decodes and validates all inputs, exactly once, at the top of `main`.
 *
 * @remarks
 * A separately exported unit so the suite can test decode + validation
 * without running the pipeline. Validation that spans fields (enum-or-range,
 * disjointness, "at least one update type active") belongs here too — this
 * template only has one content rule, but the seam is where it goes.
 *
 * A malformed boolean fails the `Config` decode typed rather than silently
 * defaulting: `Config.withDefault` only applies when the input is ABSENT,
 * not when it is present-but-malformed.
 */
export const readInputs: Effect.Effect<Inputs, InputError | Config.ConfigError> = Effect.gen(function* () {
	const inputs = yield* loadInputs;
	if (inputs.name.trim().length === 0) {
		return yield* Effect.fail(
			new InputError({
				reason: "blank-name",
				message: "The `name` input must not be blank",
			}),
		);
	}
	return inputs;
});
