import { assert, describe, it } from "@effect/vitest";
import { ActionInput } from "@effected/github-actions";
import { Effect } from "effect";
import { INPUT_NAMES, readInputs } from "../../../src/schema/inputs.js";
import { readManifest, runnerInputs } from "../../utils/manifest.js";

/**
 * An `ActionInput` environment that records every input name looked up.
 *
 * @remarks
 * Every value reads as absent while the set of names asked for is captured.
 * The provider is dual-accept (`INPUT_`-mangled first, then verbatim), so
 * repeated prefixes are stripped rather than counted: the assertion is about
 * which INPUTS are read, not how many spellings the provider tries.
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

/** `readInputs` over a runner-shaped environment with `supplied` overrides. */
const readAsRunner = (supplied: Readonly<Record<string, string>> = {}) =>
	readInputs.pipe(Effect.provide(ActionInput.layer(runnerInputs(supplied))));

describe("readInputs", () => {
	it.effect("decodes the manifest defaults the runner publishes for an unsupplied run", () =>
		Effect.gen(function* () {
			// The runner publishes EVERY declared input — its action.yml default, or
			// "" when there is none. That, not an empty record, is "no inputs
			// supplied" in production.
			const inputs = yield* readAsRunner();
			assert.deepStrictEqual(inputs, {
				name: "world",
				guests: [],
				emphatic: false,
				writeSummary: true,
				dryRun: false,
			});
		}),
	);

	it.effect("decodes supplied values", () =>
		Effect.gen(function* () {
			const inputs = yield* readAsRunner({ name: "panel", emphatic: "true", "write-summary": "false" });
			assert.strictEqual(inputs.name, "panel");
			assert.strictEqual(inputs.emphatic, true);
			assert.strictEqual(inputs.writeSummary, false);
		}),
	);

	it.effect("reads the runner-mangled variable, dashes kept", () =>
		Effect.gen(function* () {
			// Spelled the way the runner publishes it — `INPUT_WRITE-SUMMARY`, the
			// dash surviving — rather than keyed by input name. An underscore
			// (`INPUT_WRITE_SUMMARY`) would read as absent on a real runner.
			const inputs = yield* readInputs.pipe(Effect.provide(ActionInput.layer({ "INPUT_WRITE-SUMMARY": "false" })));
			assert.strictEqual(inputs.writeSummary, false);
			assert.strictEqual(ActionInput.variable("write-summary"), "INPUT_WRITE-SUMMARY");
		}),
	);

	it.effect("decodes the guests line list in every shape a workflow author writes", () =>
		Effect.gen(function* () {
			const block = yield* readAsRunner({ guests: "Ada\n  # not a guest\n- Grace\n\n" });
			assert.deepStrictEqual(block.guests, ["Ada", "Grace"]);
			const inline = yield* readAsRunner({ guests: "Ada, Grace" });
			assert.deepStrictEqual(inline.guests, ["Ada", "Grace"]);
			const json = yield* readAsRunner({ guests: '["Ada","Grace"]' });
			assert.deepStrictEqual(json.guests, ["Ada", "Grace"]);
		}),
	);

	it.effect("fails typed on a blank name", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(readAsRunner({ name: "   " }));
			assert.strictEqual(error._tag, "InputError");
			if (error._tag === "InputError") {
				assert.strictEqual(error.reason, "blank-name");
			}
		}),
	);

	it.effect("fails rather than silently defaulting on a malformed boolean", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(readAsRunner({ emphatic: "yes" }));
			assert.strictEqual(exit._tag, "Failure");
		}),
	);
});

describe("action.yml mirror", () => {
	it("INPUT_NAMES matches the inputs action.yml declares", () => {
		const declared = readManifest().inputs.map((input) => input.name);
		assert.deepStrictEqual([...INPUT_NAMES].sort(), [...declared].sort());
	});

	it.effect("INPUT_NAMES is exactly the set readInputs reads", () =>
		Effect.gen(function* () {
			const seen = new Set<string>();
			yield* readInputs.pipe(Effect.provide(ActionInput.layer(recordingEnv(seen))));
			// Guard against the spread/ownKeys false green: an empty recording
			// compared with an empty expectation proves nothing.
			assert.isAbove(seen.size, 0, "the recorder saw no reads");
			assert.deepStrictEqual([...seen].sort(), [...INPUT_NAMES].sort());
		}),
	);

	it.effect("the code's defaults ARE the manifest's defaults", () =>
		Effect.gen(function* () {
			// Two decodes that must agree: the runner-shaped environment (every
			// input carrying its action.yml default, or "") and a genuinely empty
			// one, where only the code's own `Config.withDefault` fallbacks apply.
			// Change a default in either file alone and they disagree.
			const fromManifest = yield* readAsRunner();
			const fromCode = yield* readInputs.pipe(Effect.provide(ActionInput.layer({})));
			assert.deepStrictEqual(fromCode, fromManifest);
		}),
	);
});
