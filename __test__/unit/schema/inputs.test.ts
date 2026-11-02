import { assert, describe, it } from "@effect/vitest";
import { ActionInput, ActionManifest } from "@effected/github-actions";
import { Effect } from "effect";
import { INPUT_NAMES, readInputs } from "../../../src/schema/inputs.js";
import { readActionManifest } from "../../utils/runner.js";

const manifest = readActionManifest();

/** `readInputs` over a runner-shaped environment with `supplied` overrides. */
const readAsRunner = (supplied: Readonly<Record<string, string>> = {}) =>
	readInputs.pipe(Effect.provide(ActionInput.layer(ActionManifest.runnerInputs(manifest, supplied))));

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
		const declared = Object.keys(manifest.inputs ?? {});
		assert.deepStrictEqual([...INPUT_NAMES].sort(), [...declared].sort());
	});

	it.effect("readInputs reads exactly the inputs action.yml declares, and INPUT_NAMES names them", () =>
		Effect.gen(function* () {
			// The kit's recorder journals every input lookup over the runner-shaped
			// environment; `ActionManifest.diff` matches them by runner variable.
			const recording = ActionInput.recording(ActionManifest.runnerInputs(manifest));
			yield* readInputs.pipe(Effect.provide(recording.layer));
			const read = yield* recording.names;
			// Guard against a false green: an empty recording compared with an
			// empty expectation proves nothing.
			assert.isAbove(read.length, 0, "the recorder saw no reads");
			const diff = ActionManifest.diff(manifest, { inputs: read });
			assert.isTrue(diff.inSync, JSON.stringify(diff));
			assert.deepStrictEqual([...read].sort(), [...INPUT_NAMES].sort());
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
