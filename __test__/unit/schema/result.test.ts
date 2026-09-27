import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { initialOutputs } from "../../../src/schema/outputs.js";
import { RunResult, RunResultIdentity, toRunResult } from "../../../src/schema/result.js";

/**
 * The `result` contract as THIS action defines it. What the kit owns — the
 * identity's URL derivation, the document the `schemastore` command writes,
 * drift and freshness — is `pnpm schema:check` in CI and tested upstream; it
 * is deliberately not re-tested here.
 */
describe("toRunResult", () => {
	it("stamps every payload with the identity the config publishes under", () => {
		assert.strictEqual(toRunResult(initialOutputs).$schema, RunResultIdentity.$id);
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
				$schema: RunResultIdentity.$id,
				greeting: "",
				summaryWritten: false,
				dryRun: false,
			});
		}),
	);
});

describe("RunResult", () => {
	it.effect("refuses a payload naming any other document", () =>
		Effect.gen(function* () {
			// `$schema` is a literal: a payload can only name the document that
			// validates it. Widen it back to `Schema.String` and this passes.
			const exit = yield* Effect.exit(
				Schema.decodeUnknownEffect(RunResult)({
					$schema: "https://example.com/other.json",
					greeting: "",
					summaryWritten: false,
					dryRun: false,
				}),
			);
			assert.strictEqual(exit._tag, "Failure");
		}),
	);
});
