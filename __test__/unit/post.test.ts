import { assert, describe, it } from "@effect/vitest";
import { ActionState } from "@effected/github-actions";
import type { LogLevel } from "effect";
import { Effect, Exit, Layer, References, Schema } from "effect";
import { TestClock } from "effect/testing";
import { post } from "../../src/post.js";
import { StartTimeState } from "../../src/state.js";
import type { ActionStateRecording, LogLine } from "../utils/doubles.js";
import { actionStateTestLayer, captureLogger } from "../utils/doubles.js";

/**
 * One run of `post` over test layers. `minimumLogLevel` stands in for
 * `Action.run`, which lowers it to `Debug` under the runner's step debugging.
 */
const runPost = (state: Layer.Layer<ActionState>, minimumLogLevel: LogLevel.LogLevel = "Info") =>
	Effect.gen(function* () {
		const lines: Array<LogLine> = [];
		const exit = yield* Effect.exit(
			post.pipe(
				Effect.provide(Layer.mergeAll(state, captureLogger(lines))),
				Effect.provideService(References.MinimumLogLevel, minimumLogLevel),
			),
		);
		return { exit, lines };
	});

describe("post", () => {
	it.effect("reports duration from the state main saved", () =>
		Effect.gen(function* () {
			const recording: ActionStateRecording = { entries: new Map() };
			// Seed the store the way main writes it: the schema's encoded JSON.
			// `main` read the clock at the epoch; post runs 1.5s later.
			const encoded = yield* Schema.encodeUnknownEffect(StartTimeState)(StartTimeState.make({ startedAt: 0 }));
			recording.entries.set("startTime", JSON.stringify(encoded));
			yield* TestClock.adjust("1500 millis");
			const { exit, lines } = yield* runPost(actionStateTestLayer(recording));
			assert.isTrue(Exit.isSuccess(exit));
			assert.isTrue(lines.some((line) => line.message === "Action completed in 1.50s"));
		}),
	);

	it.effect("completes quietly when main saved nothing", () =>
		Effect.gen(function* () {
			const { exit, lines } = yield* runPost(actionStateTestLayer({ entries: new Map() }));
			assert.isTrue(Exit.isSuccess(exit));
			assert.isFalse(lines.some((line) => line.message.includes("Action completed in")));
		}),
	);

	it.effect("logs at Debug, filtered at the default Info level", () =>
		Effect.gen(function* () {
			const isPostDebug = (line: LogLine) => line.level === "Debug" && line.message === "Running post-action script";
			const debug = yield* runPost(actionStateTestLayer({ entries: new Map() }), "Debug");
			assert.isTrue(debug.lines.some(isPostDebug));
			const quiet = yield* runPost(actionStateTestLayer({ entries: new Map() }));
			assert.isFalse(quiet.lines.some(isPostDebug));
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
