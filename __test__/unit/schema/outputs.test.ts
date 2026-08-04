import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { OUTPUT_NAMES, emitOutputs, initialOutputs } from "../../../src/schema/outputs.js";
import { actionOutputsTestLayer } from "../../utils/doubles.js";

/**
 * The output names declared in `action.yml`, read from the file itself — the
 * same real-parse guard the inputs suite uses.
 */
const declaredOutputNames = (): ReadonlyArray<string> => {
	const source = readFileSync(fileURLToPath(new URL("../../../action.yml", import.meta.url)), "utf8");
	const lines = source.split("\n");
	const start = lines.indexOf("outputs:");
	const names: Array<string> = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break;
		const match = /^ {2}([A-Za-z0-9-]+):\s*$/.exec(line);
		if (match?.[1] !== undefined) names.push(match[1]);
	}
	return names;
};

describe("OUTPUT_NAMES", () => {
	it("matches the outputs action.yml declares", () => {
		assert.deepStrictEqual([...OUTPUT_NAMES].sort(), [...declaredOutputNames()].sort());
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
			assert.strictEqual(byName.get("summary-written"), "false");
		}),
	);
});
