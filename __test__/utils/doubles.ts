/**
 * Test doubles: thin recording wrappers over the kit's `layerTest` doubles.
 *
 * Helper code only — files here are NOT tests and the placement suite
 * (`unit/structure.test.ts`) enforces that no `*.test.ts` file lives here,
 * where a runner could silently skip it.
 *
 * The kit's `layerTest` doubles die loudly on unstubbed members; these
 * wrappers stub exactly what the suite exercises and record what happened.
 * Recording happens inside the effect (`Effect.sync` / `Effect.gen`), never
 * eagerly at layer construction, so a described-but-never-run call cannot
 * appear in a recording.
 */

import { ActionOutputs, ActionState } from "@effected/github-actions";
import { Effect, Layer, Logger, Option, References, Schema } from "effect";

/**
 * One captured log line.
 */
export interface LogLine {
	readonly level: string;
	readonly message: string;
}

/**
 * A logger that pushes every emitted line into `lines`, installed as the only
 * logger — so a suite can assert on the log stream (the decision record)
 * regardless of what the ambient runner would print.
 */
export const captureLogger = (lines: Array<LogLine>): Layer.Layer<never> =>
	Layer.succeed(
		References.CurrentLoggers,
		new Set([
			Logger.make(({ logLevel, message }) => {
				const text = Array.isArray(message) ? message.map(String).join(" ") : String(message);
				lines.push({ level: logLevel, message: text });
			}),
		]),
	);

/**
 * The in-memory `ActionState` recording: encoded-JSON entries by key.
 */
export interface ActionStateRecording {
	readonly entries: Map<string, string>;
}

/**
 * An `ActionState` backed by an in-memory map, encoding through each caller's
 * schema exactly as the real store does — so a round trip proves the schema
 * is usable across the phase boundary rather than asserting on the double.
 */
export const actionStateTestLayer = (recording: ActionStateRecording): Layer.Layer<ActionState> =>
	ActionState.layerTest({
		save: <A, I>(key: string, value: A, schema: Schema.Codec<A, I>) =>
			Effect.gen(function* () {
				const encoded = yield* Schema.encodeUnknownEffect(schema)(value).pipe(Effect.orDie);
				recording.entries.set(key, JSON.stringify(encoded));
			}),
		getOptional: <A, I>(key: string, schema: Schema.Codec<A, I>) =>
			Effect.gen(function* () {
				const raw = recording.entries.get(key);
				if (raw === undefined) {
					return Option.none<A>();
				}
				const decoded = yield* Schema.decodeUnknownEffect(schema)(JSON.parse(raw)).pipe(Effect.orDie);
				return Option.some(decoded);
			}),
	});

/**
 * The `ActionOutputs` recording: `set` calls by name, and every summary
 * append.
 */
export interface ActionOutputsRecording {
	readonly sets: Array<{ readonly name: string; readonly value: string }>;
	readonly summaries: Array<string>;
}

/**
 * An `ActionOutputs` that records output writes and summary appends; every
 * other member keeps the kit double's die-loudly behavior.
 */
export const actionOutputsTestLayer = (recording: ActionOutputsRecording): Layer.Layer<ActionOutputs> =>
	ActionOutputs.layerTest({
		set: (name, value) =>
			Effect.sync(() => {
				recording.sets.push({ name, value });
			}),
		summary: (content) =>
			Effect.sync(() => {
				recording.summaries.push(content);
			}),
	});
