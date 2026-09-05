import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { initialOutputs } from "../../../src/schema/outputs.js";
import {
	RESULT_SCHEMA_NAME,
	RESULT_SCHEMA_URL,
	RESULT_SCHEMA_VERSION,
	RunResult,
	RunResultDocument,
	toRunResult,
} from "../../../src/schema/result.js";

describe("RESULT_SCHEMA_URL", () => {
	it("names the versioned document the generator writes", () => {
		// The generator derives the committed file's path from the same name and
		// version; if this URL stopped agreeing with them, a payload's `$schema`
		// would point at a document that does not exist.
		assert.isTrue(
			RESULT_SCHEMA_URL.endsWith(`/${RESULT_SCHEMA_VERSION}/${RESULT_SCHEMA_NAME}-${RESULT_SCHEMA_VERSION}.json`),
		);
	});

	it("carries a full three-component SemVer label", () => {
		// `@effected/schemastore` rejects anything else: a label has to round-trip
		// out of a file name unambiguously.
		assert.match(RESULT_SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
	});
});

describe("RunResultDocument", () => {
	it("describes the same encoded shape as the RunResult codec", () => {
		// The two are built from one shared `fields` object. If someone reverts
		// that and lets them drift, the published document stops describing what
		// `setJson` actually writes — the failure this test exists to catch.
		const viaClass = Schema.encodeUnknownSync(RunResult)(toRunResult(initialOutputs)) as Record<string, unknown>;
		const viaDocument = Schema.encodeUnknownSync(RunResultDocument)(toRunResult(initialOutputs) as never) as Record<
			string,
			unknown
		>;
		assert.deepStrictEqual(Object.keys(viaDocument).sort(), Object.keys(viaClass).sort());
	});

	it("carries the root annotations the published document needs", () => {
		// Core drops a `Schema.Class`'s own title/description when it hoists the
		// class into `$defs`, which is why the document is generated from a
		// struct. Annotating the class instead would emit an annotation-free
		// document and nothing else would notice.
		const annotations = RunResultDocument.ast.annotations as Record<string, unknown> | undefined;
		assert.isString(annotations?.title);
		assert.isString(annotations?.description);
		// SchemaStore's convention, checked by `DocumentLint.DescriptionWithoutUrl`.
		assert.match(annotations?.description as string, /\nhttps:\/\/\S+$/);
	});
});

describe("toRunResult", () => {
	it("stamps every payload with the schema that validates it", () => {
		assert.strictEqual(toRunResult(initialOutputs).$schema, RESULT_SCHEMA_URL);
	});

	it("projects the internal model onto the published contract", () => {
		const result = toRunResult({ greeting: "Hello, world!", summaryWritten: true, dryRun: true });
		assert.strictEqual(result.greeting, "Hello, world!");
		assert.isTrue(result.summaryWritten);
		assert.isTrue(result.dryRun);
	});

	it.effect("encodes to plain JSON, which is what setJson publishes", () =>
		Effect.gen(function* () {
			// `setJson` encodes through this schema and `JSON.stringify`s the
			// result; a field whose encoded form were not a JSON primitive would
			// fail one step later than the mistake.
			const encoded = yield* Schema.encodeUnknownEffect(RunResult)(toRunResult(initialOutputs));
			assert.deepStrictEqual(JSON.parse(JSON.stringify(encoded)), {
				$schema: RESULT_SCHEMA_URL,
				greeting: "",
				summaryWritten: false,
				dryRun: false,
			});
		}),
	);
});
