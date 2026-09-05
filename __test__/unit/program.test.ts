import { assert, describe, it } from "@effect/vitest";
import { ActionInput, ActionLogger } from "@effected/github-actions";
import { Effect, Exit, Layer } from "effect";
import { program } from "../../src/program.js";
import { RESULT_SCHEMA_URL } from "../../src/schema/result.js";
import type { ActionOutputsRecording, ActionStateRecording, LogLine } from "../utils/doubles.js";
import { actionOutputsTestLayer, actionStateTestLayer, captureLogger } from "../utils/doubles.js";

/**
 * One full run of `program` over test layers, capturing the log stream and
 * every published output. The log IS the decision record, so most assertions
 * here are on `lines`.
 */
const runProgram = (env: Record<string, string>) =>
	Effect.gen(function* () {
		const outputs: ActionOutputsRecording = { sets: [], summaries: [] };
		const state: ActionStateRecording = { entries: new Map() };
		const lines: Array<LogLine> = [];
		const exit = yield* Effect.exit(
			program.pipe(
				Effect.provide(
					Layer.mergeAll(
						ActionInput.layer(env),
						ActionLogger.layerTest(),
						actionOutputsTestLayer(outputs),
						actionStateTestLayer(state),
						captureLogger(lines),
					),
				),
			),
		);
		return { exit, outputs, state, lines };
	});

const output = (recording: ActionOutputsRecording, name: string): string | undefined =>
	recording.sets.filter((entry) => entry.name === name).at(-1)?.value;

/** The decoded `result` payload from a recorded `setJson` write. */
const resultPayload = (recording: ActionOutputsRecording, index = -1): Record<string, unknown> => {
	const writes = recording.sets.filter((entry) => entry.name === "result");
	const write = writes.at(index);
	assert.isDefined(write, "no `result` output was published");
	return JSON.parse(write.value) as Record<string, unknown>;
};

describe("program", () => {
	it.effect("greets, saves state, publishes outputs and reports", () =>
		Effect.gen(function* () {
			const { exit, outputs, state, lines } = yield* runProgram({});
			assert.isTrue(Exit.isSuccess(exit));
			// Run-context block opens the log; the result block closes it.
			assert.isTrue(lines.some((line) => line.message.includes("Run context:")));
			assert.isTrue(lines.some((line) => line.message.includes("Result:")));
			// The detect-headline names the decision.
			assert.isTrue(lines.some((line) => line.message.includes("Greeting composed: Hello, world.")));
			// Outputs: the folded model.
			assert.strictEqual(output(outputs, "greeting"), "Hello, world.");
			assert.deepStrictEqual(resultPayload(outputs), {
				$schema: RESULT_SCHEMA_URL,
				greeting: "Hello, world.",
				summaryWritten: true,
				dryRun: false,
			});
			// Cross-phase state was saved under the declared key.
			assert.isTrue(state.entries.has("startTime"));
		}),
	);

	it.effect("logs the SKIPPED reason and folds the default when the summary is disabled", () =>
		Effect.gen(function* () {
			const { exit, outputs, lines } = yield* runProgram({ "write-summary": "false" });
			assert.isTrue(Exit.isSuccess(exit));
			assert.isTrue(
				lines.some((line) =>
					line.message.includes("Step: Write job summary — SKIPPED: disabled by the write-summary input"),
				),
			);
			assert.strictEqual(resultPayload(outputs).summaryWritten, false);
		}),
	);

	it.effect("rehearses under dry-run: no summary write, honest outputs", () =>
		Effect.gen(function* () {
			const { exit, outputs } = yield* runProgram({ "dry-run": "true" });
			assert.isTrue(Exit.isSuccess(exit));
			assert.strictEqual(outputs.summaries.length, 0);
			assert.deepStrictEqual(resultPayload(outputs), {
				$schema: RESULT_SCHEMA_URL,
				greeting: "Hello, world.",
				summaryWritten: false,
				dryRun: true,
			});
		}),
	);

	it.effect("emits the all-disabled baseline BEFORE any work, not from a failure handler", () =>
		Effect.gen(function* () {
			const { exit, outputs } = yield* runProgram({});
			assert.isTrue(Exit.isSuccess(exit));
			// The ordering IS the contract (B10). Four writes: the baseline pair
			// first, then the folded pair. A program that emitted the baseline
			// from `Effect.onError` would record only the folded pair here — and
			// would OVERWRITE it with the baseline on a later failure, publishing
			// a false statement about work that actually happened.
			assert.deepStrictEqual(
				outputs.sets.map((entry) => entry.name),
				["greeting", "result", "greeting", "result"],
			);
			assert.strictEqual(outputs.sets[0]?.value, "");
			assert.deepStrictEqual(resultPayload(outputs, 0), {
				$schema: RESULT_SCHEMA_URL,
				greeting: "",
				summaryWritten: false,
				dryRun: false,
			});
		}),
	);

	it.effect("still emits every output when the run aborts inside readInputs itself", () =>
		Effect.gen(function* () {
			// A malformed boolean fails the `Config` DECODE — the earliest thing
			// that can abort the run, and strictly before any validation this
			// module controls. The baseline is on disk anyway, which no `onError`
			// handler ordering could be relied on to guarantee.
			const { exit, outputs } = yield* runProgram({ emphatic: "yes" });
			assert.isTrue(Exit.isFailure(exit));
			assert.deepStrictEqual(
				outputs.sets.map((entry) => entry.name),
				["greeting", "result"],
			);
			assert.strictEqual(output(outputs, "greeting"), "");
			assert.strictEqual(resultPayload(outputs).greeting, "");
		}),
	);

	it.effect("fails typed on a blank name and still emits every output", () =>
		Effect.gen(function* () {
			const { exit, outputs } = yield* runProgram({ name: "   " });
			assert.isTrue(Exit.isFailure(exit));
			// Outputs-on-every-abort-path: the baseline written up front stands,
			// and nothing re-publishes it afterwards.
			assert.strictEqual(outputs.sets.length, 2);
			assert.strictEqual(output(outputs, "greeting"), "");
			assert.strictEqual(resultPayload(outputs).summaryWritten, false);
		}),
	);
});
