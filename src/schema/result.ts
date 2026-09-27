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
 * - **One identity, read twice.** {@link RunResultIdentity} is a
 *   `HostedSchema`: the payload asserts its `$id` as `$schema`, and
 *   `schemastore.config.ts` hands the SAME value to `defineConfig` as
 *   `hosted`, so the committed document's `$id`, its write path and the URL
 *   every payload names all derive from one declaration. Nothing is spelled
 *   by hand, so nothing can disagree — and there is no test pinning them,
 *   because there is nothing left to pin.
 * - **One schema, two consumers.** {@link RunResult} is the codec `setJson`
 *   encodes through AND the schema the config publishes a document from.
 * - **A pure projection, not the internal model.** {@link toRunResult} is a
 *   total function from the action's `OutputsModel` to the published shape, so
 *   internal churn surfaces as a type error here rather than as a silently
 *   changed contract downstream.
 * - **Prose is annotated at the definition site.** Field prose goes in each
 *   field's `description`; the document's own `title`/`description` go on the
 *   inner `Schema.Struct` handed to `Schema.Class` (see {@link RunResult}).
 *   A machine-reader hint that does not belong in `description` may use the
 *   declared `x-ai-*` family (`x-ai-hint`); any other non-standard key is
 *   either not emitted at all or refused by the build — never published.
 *
 * `@effected/schemastore` is a runtime dependency for exactly one reason: to
 * read this identity. It is engine-free (ajv lives in
 * `@effected/schemastore-cli`, a devDependency), and the bundle-truth
 * integration test asserts no engine reaches `dist/`.
 *
 * @module schema/result
 */

import { HostedSchema } from "@effected/schemastore";
import { Schema } from "effect";
import type { OutputsModel } from "./outputs.js";

/**
 * Where the `result` document is hosted and which version is current.
 *
 * @remarks
 * `$id` derives as
 * `https://raw.githubusercontent.com/<repo>/<branch>/<path>/<version>/<name>-<version>.json`
 * under the default `"versioned"` layout. Version labels are SemVer-ordered
 * (numeric, so `1.10.0` sorts above `1.9.0`); the newest in `versions` is the
 * one generated, and every other label is a frozen file the `schemastore`
 * command verifies but never regenerates.
 *
 * To version the contract once it is published: append the next label
 * (`versions: ["1.0.0", "1.1.0"]`) — see `docs/04-output-schema.md`.
 */
export const RunResultIdentity: HostedSchema = HostedSchema.github({
	repo: "savvy-web/github-action-template",
	path: "schemas",
	name: "github-action-template",
	versions: ["1.0.0"],
});

/**
 * The `result` output's published shape — the codec `setJson` encodes
 * through, and the schema the committed JSON Schema document is generated
 * from.
 *
 * @remarks
 * The document-level `title`/`description` are annotated on the inner
 * `Schema.Struct`, not passed as `Schema.Class`'s second argument. Core
 * hoists a class into a `$defs` entry built from its ENCODED ast, which is
 * the struct: annotations on the struct travel there, while class-level
 * annotations do not reach the emitted document (probed against the installed
 * `effect`). The command places the root `$ref` over that entry, so the
 * annotated struct IS the document's description.
 *
 * `$schema` is a literal: a payload can only ever name the document that
 * validates it, and the published document says so (`enum: [<$id>]`).
 */
export class RunResult extends Schema.Class<RunResult>("RunResult")(
	Schema.Struct({
		$schema: Schema.Literal(RunResultIdentity.$id).annotate({
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
	}).annotate({
		title: "Action run result",
		// SchemaStore's convention, which `DocumentLint` checks as
		// `DescriptionWithoutUrl`: the description ends with a documentation URL
		// on its own line.
		description: [
			"The structured `result` output of savvy-web/github-action-template: what the run greeted, whether it wrote a job summary, and whether it was a rehearsal.",
			"https://github.com/savvy-web/github-action-template/blob/main/docs/04-output-schema.md",
		].join("\n"),
	}),
) {}

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
		$schema: RunResultIdentity.$id,
		greeting: model.greeting,
		summaryWritten: model.summaryWritten,
		dryRun: model.dryRun,
	});
