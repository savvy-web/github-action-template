import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { ActionInput } from "@effected/github-actions";
import { Effect } from "effect";
import { INPUT_NAMES, readInputs } from "../../../src/schema/inputs.js";

/**
 * The input names declared in `action.yml`, read from the file itself.
 *
 * @remarks
 * A deliberate few-line parse rather than a YAML dependency: the block is
 * two-space-indented `name:` keys between the top-level `inputs:` and the
 * next top-level key, and reading it for real is what makes the guard bite
 * when `action.yml` and the code drift apart.
 */
const declaredInputNames = (): ReadonlyArray<string> => {
	const source = readFileSync(fileURLToPath(new URL("../../../action.yml", import.meta.url)), "utf8");
	const lines = source.split("\n");
	const start = lines.indexOf("inputs:");
	const names: Array<string> = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break;
		const match = /^ {2}([A-Za-z0-9-]+):\s*$/.exec(line);
		if (match?.[1] !== undefined) names.push(match[1]);
	}
	return names;
};

/**
 * An `ActionInput` environment that records every input name looked up.
 *
 * @remarks
 * Every value reads as absent — exactly the "no inputs supplied" case — while
 * the set of names asked for is captured. The provider is dual-accept
 * (`INPUT_`-mangled first, then verbatim), so repeated prefixes are stripped
 * rather than counted: the assertion is about which INPUTS are read, not how
 * many spellings the provider tries.
 */
const recordingEnv = (seen: Set<string>): Record<string, string> =>
	new Proxy({} as Record<string, string>, {
		get: (_target, property) => {
			if (typeof property === "string" && property.startsWith("INPUT_")) {
				seen.add(property.replace(/^(?:INPUT_)+/, "").toLowerCase());
			}
			return undefined;
		},
	});

describe("readInputs", () => {
	it.effect("applies action.yml defaults when everything is absent", () =>
		Effect.gen(function* () {
			const inputs = yield* readInputs;
			assert.strictEqual(inputs.name, "world");
			assert.strictEqual(inputs.emphatic, false);
			assert.strictEqual(inputs.writeSummary, true);
			assert.strictEqual(inputs.dryRun, false);
		}).pipe(Effect.provide(ActionInput.layer({}))),
	);

	it.effect("decodes supplied values", () =>
		Effect.gen(function* () {
			const inputs = yield* readInputs;
			assert.strictEqual(inputs.name, "panel");
			assert.strictEqual(inputs.emphatic, true);
			assert.strictEqual(inputs.writeSummary, false);
		}).pipe(Effect.provide(ActionInput.layer({ name: "panel", emphatic: "true", "write-summary": "false" }))),
	);

	it.effect("fails typed on a blank name", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(readInputs);
			assert.strictEqual(error._tag, "InputError");
			if (error._tag === "InputError") {
				assert.strictEqual(error.reason, "blank-name");
			}
		}).pipe(Effect.provide(ActionInput.layer({ name: "   " }))),
	);

	it.effect("fails rather than silently defaulting on a malformed boolean", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(readInputs);
			assert.strictEqual(exit._tag, "Failure");
		}).pipe(Effect.provide(ActionInput.layer({ emphatic: "yes" }))),
	);
});

describe("INPUT_NAMES", () => {
	it("matches the inputs action.yml declares", () => {
		assert.deepStrictEqual([...INPUT_NAMES].sort(), [...declaredInputNames()].sort());
	});

	it.effect("is exactly the set readInputs reads", () =>
		Effect.gen(function* () {
			const seen = new Set<string>();
			yield* readInputs.pipe(Effect.provide(ActionInput.layer(recordingEnv(seen))));
			assert.deepStrictEqual([...seen].sort(), [...INPUT_NAMES].sort());
		}),
	);
});
