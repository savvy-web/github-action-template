/**
 * The JSON Schema publication config for this action's structured `result`
 * output, read by the `schemastore` command from `@effected/schemastore-cli`.
 *
 * @remarks
 * `pnpm schema:build` runs `schemastore build` (generate → lint → ajv strict
 * gate → drift policy → content-compared write) and `pnpm schema:check` runs
 * `schemastore check`, the identical walk with no writes, which fails whenever
 * a build would write anything. The command finds this file by walking upward
 * from the working directory; relative paths resolve against THIS file's
 * directory.
 *
 * The entry is keyed by, and `hosted` by, the SAME `HostedSchema` the action
 * stamps into every payload's `$schema` — `$id`, the write path
 * (`schemas/<version>/<name>-<version>.json`) and every URL derive from it,
 * so nothing here is spelled by hand and nothing can disagree with `src`.
 * The config composes no layers; the command supplies the engine and the
 * platform.
 *
 * **`published: false` — flip it at the first real release.** An unpublished
 * schema regenerates IN PLACE through any change, contract included, which is
 * right for a template (and for a freshly bootstrapped copy, whose identity no
 * consumer has fetched yet). The day a consumer pins the document, set
 * `published: true`: from then a contract change at the current label is
 * DRIFT, and the command refuses every write (exit 1) and names the label to
 * bump to. The response is to append that label to the identity's `versions`
 * in `src/schema/result.ts` — the previous label becomes a frozen file the
 * command verifies on every run but never regenerates. Never `--force` a
 * published schema. See `docs/04-output-schema.md`.
 *
 * Objects are emitted closed (`additionalProperties: false`) by default: the
 * payload is exactly what `RunResult` encodes.
 *
 * @module schemastore.config
 */

import { defineConfig } from "@effected/schemastore";
import { RunResult, RunResultIdentity } from "./src/schema/result.js";

export default defineConfig({
	outputDir: "schemas",
	schemas: {
		[RunResultIdentity.name]: {
			schema: RunResult,
			hosted: RunResultIdentity,
			published: false,
		},
	},
});
