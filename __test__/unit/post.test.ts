import { assert, describe, it } from "@effect/vitest";
import { ActionState } from "@effected/github-actions";
import { Effect, Exit, Layer, Schema } from "effect";
import { post } from "../../src/post.js";
import { StartTimeState } from "../../src/state.js";
import type { ActionStateRecording, LogLine } from "../utils/doubles.js";
import { actionStateTestLayer, captureLogger } from "../utils/doubles.js";

const runPost = (state: Layer.Layer<ActionState>) =>
	Effect.gen(function* () {
		const lines: Array<LogLine> = [];
		const exit = yield* Effect.exit(post.pipe(Effect.provide(Layer.mergeAll(state, captureLogger(lines)))));
		return { exit, lines };
	});

describe("post", () => {
	it.effect("reports duration from the state main saved", () =>
		Effect.gen(function* () {
			const recording: ActionStateRecording = { entries: new Map() };
			// Seed the store the way main writes it: the schema's encoded JSON.
			const encoded = yield* Schema.encodeUnknownEffect(StartTimeState)(
				StartTimeState.make({ startedAt: Date.now() - 1500 }),
			);
			recording.entries.set("startTime", JSON.stringify(encoded));
			const { exit, lines } = yield* runPost(actionStateTestLayer(recording));
			assert.isTrue(Exit.isSuccess(exit));
			assert.isTrue(lines.some((line) => line.message.includes("Action completed in")));
		}),
	);

	it.effect("completes quietly when main saved nothing", () =>
		Effect.gen(function* () {
			const { exit, lines } = yield* runPost(actionStateTestLayer({ entries: new Map() }));
			assert.isTrue(Exit.isSuccess(exit));
			assert.isFalse(lines.some((line) => line.message.includes("Action completed in")));
		}),
	);

	it.effect("never fails the workflow: a defect demotes to a warning", () =>
		Effect.gen(function* () {
			const dying = ActionState.layerTest({
				getOptional: () => Effect.die(new Error("state exploded")),
			});
			const { exit, lines } = yield* runPost(dying);
			// The double net: post's exit is SUCCESS even when state dies.
			assert.isTrue(Exit.isSuccess(exit));
			assert.isTrue(lines.some((line) => line.level === "Warn" && line.message.includes("Post-action warning")));
		}),
	);
});
