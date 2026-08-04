import { assert, describe, it } from "@effect/vitest";
import { ActionInput, ActionLogger } from "@effected/github-actions";
import { Effect, Exit, Layer } from "effect";
import { program } from "../../src/program.js";
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
	recording.sets.find((entry) => entry.name === name)?.value;

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
			assert.strictEqual(output(outputs, "summary-written"), "true");
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
			assert.strictEqual(output(outputs, "summary-written"), "false");
		}),
	);

	it.effect("rehearses under dry-run: no summary write, honest outputs", () =>
		Effect.gen(function* () {
			const { exit, outputs } = yield* runProgram({ "dry-run": "true" });
			assert.isTrue(Exit.isSuccess(exit));
			assert.strictEqual(outputs.summaries.length, 0);
			assert.strictEqual(output(outputs, "summary-written"), "false");
			assert.strictEqual(output(outputs, "greeting"), "Hello, world.");
		}),
	);

	it.effect("fails typed on a blank name and still emits every output", () =>
		Effect.gen(function* () {
			const { exit, outputs } = yield* runProgram({ name: "   " });
			assert.isTrue(Exit.isFailure(exit));
			// Outputs-on-every-abort-path: the all-disabled baseline is published.
			assert.strictEqual(output(outputs, "greeting"), "");
			assert.strictEqual(output(outputs, "summary-written"), "false");
		}),
	);
});
