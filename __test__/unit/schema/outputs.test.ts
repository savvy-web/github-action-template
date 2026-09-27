import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { OUTPUT_NAMES, emitOutputs, initialOutputs } from "../../../src/schema/outputs.js";
import { RunResultIdentity } from "../../../src/schema/result.js";
import { actionOutputsTestLayer } from "../../utils/doubles.js";
import { readManifest } from "../../utils/manifest.js";

describe("OUTPUT_NAMES", () => {
	it("matches the outputs action.yml declares", () => {
		assert.deepStrictEqual([...OUTPUT_NAMES].sort(), [...readManifest().outputs].sort());
	});
});

describe("emitOutputs", () => {
	it.effect("writes every declared output exactly once", () =>
		Effect.gen(function* () {
			const recording = { sets: [], summaries: [] } as {
				sets: Array<{ name: string; value: string }>;
				summaries: Array<string>;
			};
			yield* emitOutputs(initialOutputs).pipe(Effect.provide(actionOutputsTestLayer(recording)));
			assert.deepStrictEqual(recording.sets.map((entry) => entry.name).sort(), [...OUTPUT_NAMES].sort());
			assert.strictEqual(recording.sets.length, OUTPUT_NAMES.length);
		}),
	);

	it.effect("renders the all-disabled baseline as empty-and-false", () =>
		Effect.gen(function* () {
			const recording = { sets: [], summaries: [] } as {
				sets: Array<{ name: string; value: string }>;
				summaries: Array<string>;
			};
			yield* emitOutputs(initialOutputs).pipe(Effect.provide(actionOutputsTestLayer(recording)));
			const byName = new Map(recording.sets.map((entry) => [entry.name, entry.value]));
			assert.strictEqual(byName.get("greeting"), "");
			// The structured output is recorded ENCODED, exactly as the runner
			// would see it — a JSON string, not the in-memory object.
			assert.deepStrictEqual(JSON.parse(byName.get("result") ?? "null"), {
				$schema: RunResultIdentity.$id,
				greeting: "",
				summaryWritten: false,
				dryRun: false,
			});
		}),
	);
});
