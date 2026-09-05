import { assert, describe, it } from "@effect/vitest";
import { DocumentDiff, SchemaPipeline } from "@effected/schemastore";
import { Effect } from "effect";
import { AppLayer, targets } from "../../lib/scripts/generate-schema.js";

/**
 * Drift guard for the committed JSON Schema document.
 *
 * A generated artifact with no drift test is a lie waiting to happen: the day
 * someone edits `RunResult` and forgets `pnpm schema:generate`, the committed
 * document silently describes a shape the action no longer emits, and every
 * consumer validating against it is wrong in a way nothing reports.
 *
 * **This imports the generator's own exported `targets` and `AppLayer`.** That
 * is the whole point — a test that rebuilt either would pass while the
 * generator wrote something else entirely, which is a drift test that cannot
 * detect drift. `SchemaPipeline.check` is the identical walk to
 * `SchemaPipeline.run` without the write, so what is asserted here is exactly
 * what the generator would do.
 *
 * The comparison is by parsed CONTENT, never bytes: a formatter that owns the
 * committed JSON can reflow it freely, where a text comparison would report
 * drift forever.
 */
describe("generated JSON Schema", () => {
	it("has a target for every document the action publishes", () => {
		// Guards the degenerate case: `check([])` trivially reports no drift, so
		// a targets list that lost its entry would pass every assertion below
		// while checking nothing at all.
		assert.isAbove(targets.length, 0);
	});

	it.effect("matches its Effect Schema source and would pass the generator's gate", () =>
		Effect.gen(function* () {
			const results = yield* SchemaPipeline.check(targets);

			for (const result of results) {
				// BOTH halves are asserted, deliberately. A document whose findings
				// block the gate could never be written — so it also reports no
				// pending write, and `isClean` alone would call a permanently
				// ungeneratable schema up to date.
				assert.isFalse(
					result.blocked,
					`${result.path} would fail the gate: ${result.findings.map((finding) => finding.label).join(", ")}`,
				);
				assert.isTrue(
					DocumentDiff.isClean(result.change),
					`${result.path} is out of date (${result.change}). Run \`pnpm schema:generate\` and commit the result.`,
				);
			}
		}).pipe(Effect.provide(AppLayer)),
	);
});
