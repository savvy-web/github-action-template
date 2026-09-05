/**
 * Generate the committed JSON Schema document for this action's structured
 * `result` output.
 *
 * @remarks
 * `src/schema/result.ts`'s shared `fields` object is the single source of truth:
 * the `RunResult` class `ActionOutputs.setJson` encodes the payload through and
 * the `RunResultDocument` struct this script publishes are built from it. Everything below {@link targets} belongs
 * to `@effected/schemastore` — `SchemaPipeline.run` is the whole
 * generate → lint → validate → gate → write sequence (core's Draft 2020-12
 * generation lowered to Draft-07, the `#/definitions` → `#/$defs` `$ref`
 * rewrite that lowering makes necessary, the structural lint, a real ajv
 * strict-mode gate, and a content-comparing write through a deterministic
 * serializer). This script supplies the target manifest and the log wording,
 * and nothing else: a hand-rolled lowering is how a repo ends up maintaining a
 * JSON Schema engine it did not mean to write.
 *
 * Because the write compares parsed CONTENT rather than bytes, the generated
 * file needs no formatter carve-out — Biome reflowing it does not provoke a
 * rewrite on the next run, and the drift test stays green either way.
 *
 * Run via `pnpm schema:generate`. The committed output is guarded by
 * `__test__/unit/generate-schema.test.ts`, which imports {@link targets} and
 * {@link AppLayer} from HERE and runs `SchemaPipeline.check` — the identical
 * walk, without writing.
 *
 * @module lib/scripts/generate-schema
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { SchemaFile, SchemaPipeline, SchemaTarget, SchemaValidator, SchemaVersioning } from "@effected/schemastore";
import { Effect, Layer, Result } from "effect";
import {
	RESULT_SCHEMA_NAME,
	RESULT_SCHEMA_URL,
	RESULT_SCHEMA_VERSION,
	RunResultDocument,
} from "../../src/schema/result.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * The publication version, parsed rather than asserted.
 *
 * @remarks
 * `SchemaVersioning` rejects anything that is not full three-component SemVer,
 * so a label like `"1.0"` fails here — at generation time, with a message —
 * instead of producing a file name that cannot be parsed back into a version.
 */
const SCHEMA_SEMVER = SchemaVersioning.parseResult(RESULT_SCHEMA_VERSION).pipe(
	Result.getOrThrowWith((error) => new Error(`RESULT_SCHEMA_VERSION is not a valid schema version: ${error.message}`)),
);

/**
 * The schema publication targets: one per emitted document.
 *
 * @remarks
 * Exported so the drift test checks exactly the wiring the generator writes —
 * a test that rebuilt its own target list would pass while the generator
 * emitted something else, which is a drift test that cannot detect drift.
 *
 * The document is **versioned**: every emitted payload names it in its own
 * `$schema` field, so its URL has to keep resolving after the shape moves on.
 * `name` becomes required the moment `version` is present, enforced by an
 * overload pair rather than a runtime check.
 */
export const targets: ReadonlyArray<SchemaTarget> = [
	SchemaTarget.make({
		// `RunResultDocument`, not the `RunResult` class: they share one `fields`
		// object, but core drops a class's own title/description when it hoists
		// the class into `$defs`. See the note on `RunResultDocument`.
		schema: RunResultDocument,
		// Taken verbatim from `src` rather than rebuilt here: the payload's
		// `$schema` and the document's `$id` are then the same string by
		// construction, not by two constructions agreeing.
		$id: RESULT_SCHEMA_URL,
		name: RESULT_SCHEMA_NAME,
		version: SCHEMA_SEMVER,
		path: resolve(REPO_ROOT, "schemas", SCHEMA_SEMVER, SchemaVersioning.fileName(RESULT_SCHEMA_NAME, SCHEMA_SEMVER)),
	}),
];

/**
 * The layer both the generator and the drift test provide.
 *
 * @remarks
 * Exported for the same reason {@link targets} is: a test that rebuilds the
 * layer can pass while the generator runs against a different one.
 * `SchemaValidator.layer` is a real ajv engine the package ships — there is no
 * adapter for this repo to write.
 */
export const AppLayer: Layer.Layer<SchemaFile | SchemaValidator> = Layer.mergeAll(
	SchemaFile.layer,
	SchemaValidator.layer,
).pipe(Layer.provide(NodeServices.layer));

const generate = Effect.gen(function* () {
	// ── Contract gate, BEFORE anything is written ─────────────────────────────
	// `check` is the same walk as `run` with no writes, and it does NOT stop at
	// the first blocked target — so a repo with two broken documents learns
	// about both in one run. Gating here rather than after `run` is the whole
	// point: a `contract` change means an assertion moved, and rewriting an
	// already-published version's file in place would silently break every
	// consumer pinned to its URL. Failing after the write would report the
	// problem accurately and still have caused it.
	//
	// `DocumentDiff` classifies `default`, `examples`, `readOnly` and
	// `writeOnly` as contract changes even though the spec calls them
	// annotations — consumers act on them, and under-reporting ships a silent
	// break while over-reporting only costs a bump. `"created"` is not a
	// contract change: a version's first write has no predecessor to break.
	const preflight = yield* SchemaPipeline.check(targets);
	const broken = preflight.filter((result) => result.change === "contract");
	if (broken.length > 0) {
		for (const result of broken) {
			yield* Effect.logError(`Contract change in an already-published schema: ${result.path}`);
		}
		return yield* Effect.fail(
			new Error(
				`${broken.length} document(s) changed their contract at version ${SCHEMA_SEMVER}. ` +
					"Nothing was written. Bump RESULT_SCHEMA_VERSION in src/schema/result.ts to the new label, " +
					"then re-run: the new version writes a new file and leaves the published one intact.",
			),
		);
	}

	// The gate-and-write walk is the package's. Its default blocking predicate
	// is `severity === "warning"`, which is the policy we want: every warning
	// describes a document that is broken for the editors it exists to serve.
	const results = yield* SchemaPipeline.run(targets);

	for (const result of results) {
		// Anything surviving the gate is advisory by definition.
		for (const finding of result.findings) {
			yield* Effect.logInfo(`${result.$id}: ${finding.label} at "${finding.path}" — ${finding.message}`);
		}
		yield* Effect.log(
			result.outcome === "written" ? `Written (${result.change}): ${result.path}` : `Unchanged: ${result.path}`,
		);
	}
});

// Guarded so the drift test can import `targets` and `AppLayer` without
// generating anything.
const invokedDirectly =
	process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

/* v8 ignore next 3 -- direct-invocation guard; the suite imports this module, never runs it */
if (invokedDirectly) {
	await Effect.runPromise(generate.pipe(Effect.provide(AppLayer)));
}
