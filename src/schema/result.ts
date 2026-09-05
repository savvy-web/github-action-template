/**
 * The structured `result` output: this action's machine-readable contract.
 *
 * @remarks
 * A `setJson` output consumed by anything other than the same workflow's next
 * step — a downstream job, a bot, an LLM reading workflow output — is a public
 * API, so it is published as a **versioned** JSON Schema document under
 * `schemas/<version>/`. The rules that follow are the template's one live
 * example of that contract:
 *
 * - **One field list, two consumers.** {@link RunResult} encodes the payload
 *   (it IS the encoder — `setJson` takes a `Schema.Codec`) and
 *   {@link RunResultDocument} is what `lib/scripts/generate-schema.ts`
 *   publishes a document from. Both are built from one shared `fields` object,
 *   so the encoder and the published contract cannot drift.
 * - **A pure projection, not the internal model.** {@link toRunResult} is a
 *   total function from the action's `OutputsModel` to the published shape, so
 *   internal churn surfaces as a type error here rather than as a silently
 *   changed contract downstream.
 * - **Field prose lives in `description`.** The Draft-07 lowering drops every
 *   keyword outside its copy-list and the declared non-standard families, so an
 *   invented `x-ai-*` hint is silently dropped. Annotate at the DEFINITION site;
 *   a usage-site annotation on a hoisted schema carries nothing through.
 * - **The version label is full three-component SemVer** and the payload names
 *   the document that validates it, via `$schema`, so a consumer reading the
 *   output can fetch its contract. Bumping {@link RESULT_SCHEMA_VERSION} is the
 *   response to a contract change — see the gate in the generator.
 *
 * @module schema/result
 */

import { Schema } from "effect";
import type { OutputsModel } from "./outputs.js";

/**
 * Where this action's published schema documents live.
 *
 * @remarks
 * Spelled here rather than in the generator so `src` owns its own contract URL:
 * the generator imports {@link RESULT_SCHEMA_URL} verbatim as the target's
 * `$id`, which is what keeps the emitted payload's `$schema` and the committed
 * document's `$id` the same string by construction.
 */
const SCHEMA_BASE_URL = "https://raw.githubusercontent.com/savvy-web/github-action-template/main/schemas";

/**
 * The catalog/file base name the `result` document publishes under.
 */
export const RESULT_SCHEMA_NAME = "github-action-template";

/**
 * The published version of the `result` document.
 *
 * @remarks
 * Full three-component SemVer, enforced by `@effected/schemastore`: its order is
 * numeric rather than lexical (`1.10.0` above `1.9.0`), and a bare-major label
 * is rejected because it cannot round-trip out of a file name unambiguously.
 */
export const RESULT_SCHEMA_VERSION = "1.0.0";

/**
 * The canonical URL of the document that validates a `result` payload.
 *
 * @remarks
 * `schemas/<version>/<name>-<version>.json` — the directory carries the same
 * label as the file so a version's artifacts stay together while the file name
 * stays the one SchemaStore resolves.
 */
export const RESULT_SCHEMA_URL = `${SCHEMA_BASE_URL}/${RESULT_SCHEMA_VERSION}/${RESULT_SCHEMA_NAME}-${RESULT_SCHEMA_VERSION}.json`;

/**
 * The `result` payload's fields, named once.
 *
 * @remarks
 * Shared deliberately: {@link RunResult} is the runtime codec `setJson` encodes
 * through, {@link RunResultDocument} is what the generator publishes a document
 * from, and both are built from THIS object. Two field lists describing "the
 * same" payload drift independently; one list used twice never can.
 *
 * Field prose lives in `description` here, at the definition site. The Draft-07
 * lowering drops every keyword outside its copy-list and the declared
 * non-standard families, so an invented `x-ai-*` hint is silently discarded.
 */
const fields = {
	$schema: Schema.String.annotate({
		description: "URL of the JSON Schema document that validates this payload.",
	}),
	greeting: Schema.String.annotate({
		description: "The rendered greeting. Empty string when the run failed before the greeting was composed.",
	}),
	summaryWritten: Schema.Boolean.annotate({
		description:
			"Whether the job summary panel was appended. False when the write-summary input disabled it, the run was a rehearsal, or the write degraded to a warning.",
	}),
	dryRun: Schema.Boolean.annotate({
		description: "Whether the run was a rehearsal, performing no mutation.",
	}),
};

/**
 * The `result` output's published shape — the codec `setJson` encodes through.
 */
export class RunResult extends Schema.Class<RunResult>("RunResult")(fields) {}

/**
 * The schema the published JSON Schema document is generated FROM.
 *
 * @remarks
 * Structurally identical to {@link RunResult} — same `fields` object — but a
 * `Schema.Struct` rather than the class, and that difference is load-bearing.
 *
 * Core's `Schema.toJsonSchemaDocument` hoists a `Schema.Class` into a `$defs`
 * entry built from its ENCODED ast, and the class's own `title`/`description`
 * do not travel there: probed against the installed effect beta, a class-level
 * annotation (passed to `Schema.Class` OR via `.annotate(...)`) reaches neither
 * the emitted root — which is nothing but `$ref: "#/$defs/RunResultEncoded"` —
 * nor the definition, while the identical annotation on a `Struct` survives.
 * `SchemaTarget` exposes no document or annotation override, so lowering from
 * the annotated struct is the only route to a document that describes itself.
 *
 * Tracked upstream; when a class's annotations reach its encoded definition,
 * this can collapse back into {@link RunResult} and the target can name the
 * class again.
 */
export const RunResultDocument = Schema.Struct(fields).annotate({
	title: "Action run result",
	// SchemaStore's convention, which `DocumentLint` checks as
	// `DescriptionWithoutUrl`: the description ends with a documentation URL on
	// its own line. Reachable only because the annotation now survives the
	// lowering at all — see the note above.
	description: [
		"The structured `result` output of savvy-web/github-action-template: what the run greeted, whether it wrote a job summary, and whether it was a rehearsal.",
		"https://github.com/savvy-web/github-action-template/blob/main/docs/04-output-schema.md",
	].join("\n"),
});

/**
 * Projects the action's internal output model onto the published contract.
 *
 * @remarks
 * Deliberately plain and total — no `Effect`, nothing that can fail — so a
 * schema-shape change is a compile error at this one call site rather than a
 * runtime failure a downstream consumer discovers.
 */
export const toRunResult = (model: OutputsModel): RunResult =>
	new RunResult({
		$schema: RESULT_SCHEMA_URL,
		greeting: model.greeting,
		summaryWritten: model.summaryWritten,
		dryRun: model.dryRun,
	});
