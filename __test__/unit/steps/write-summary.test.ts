import { assert, describe, it } from "@effect/vitest";
import { ActionOutputs, DryRun, RunnerFileWriteError } from "@effected/github-actions";
import { Effect, Layer } from "effect";
import { initialOutputs } from "../../../src/schema/outputs.js";
import { writeSummary } from "../../../src/steps/write-summary.js";
import type { ActionOutputsRecording, LogLine } from "../../utils/doubles.js";
import { actionOutputsTestLayer, captureLogger } from "../../utils/doubles.js";

const inputs = { name: "world", emphatic: false, writeSummary: true, dryRun: false };
const outputs = { ...initialOutputs, greeting: "Hello, world." };

const emptyRecording = (): ActionOutputsRecording => ({ sets: [], summaries: [] });

describe("writeSummary", () => {
	it.effect("appends the panel on a real run", () =>
		Effect.gen(function* () {
			const recording = emptyRecording();
			const result = yield* writeSummary({ inputs, outputs }).pipe(
				Effect.provide(Layer.mergeAll(actionOutputsTestLayer(recording), DryRun.layerFrom(false))),
			);
			assert.isTrue(result.written);
			assert.strictEqual(recording.summaries.length, 1);
			assert.include(recording.summaries[0] ?? "", "Hello, world.");
		}),
	);

	it.effect("skips with a logged reason when disabled by input", () =>
		Effect.gen(function* () {
			const recording = emptyRecording();
			const lines: Array<LogLine> = [];
			const result = yield* writeSummary({
				inputs: { ...inputs, writeSummary: false },
				outputs,
			}).pipe(
				Effect.provide(
					Layer.mergeAll(actionOutputsTestLayer(recording), DryRun.layerFrom(false), captureLogger(lines)),
				),
			);
			assert.isFalse(result.written);
			assert.strictEqual(recording.summaries.length, 0);
			assert.isTrue(
				lines.some((line) =>
					line.message.includes("Step: Write job summary — SKIPPED: disabled by the write-summary input"),
				),
			);
		}),
	);

	it.effect("writes nothing under dry-run and reports unwritten", () =>
		Effect.gen(function* () {
			const recording = emptyRecording();
			const result = yield* writeSummary({ inputs, outputs }).pipe(
				Effect.provide(Layer.mergeAll(actionOutputsTestLayer(recording), DryRun.layerFrom(true))),
			);
			assert.isFalse(result.written);
			assert.strictEqual(recording.summaries.length, 0);
		}),
	);

	it.effect("degrades a failed write to a warning instead of failing the job", () =>
		Effect.gen(function* () {
			const lines: Array<LogLine> = [];
			// `ActionOutputError` is a UNION ALIAS, not a class: the kit ships one
			// tagged class per failure, so a double fails with the specific arm.
			// Match on `_tag`, never a `reason` field — that shape is gone.
			const failingOutputs = ActionOutputs.layerTest({
				summary: () => Effect.fail(new RunnerFileWriteError({ file: "GITHUB_STEP_SUMMARY" })),
			});
			const result = yield* writeSummary({ inputs, outputs }).pipe(
				Effect.provide(Layer.mergeAll(failingOutputs, DryRun.layerFrom(false), captureLogger(lines))),
			);
			assert.isFalse(result.written);
			assert.isTrue(
				lines.some((line) => line.level === "Warn" && line.message.includes("SummaryWriteError/write-failed")),
			);
		}),
	);
});
