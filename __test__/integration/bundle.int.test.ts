import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { RunResultIdentity } from "../../src/schema/result.js";
import { readManifest, runnerInputs } from "../utils/manifest.js";
import { runBundle } from "../utils/runner.js";

/**
 * Bundle truth: the COMMITTED `dist/` — what the runner actually executes —
 * run end to end as two real Node processes, `main` then `post`.
 *
 * @remarks
 * The unit suite runs `src/` through vitest; it can never see the bundle. The
 * `Test` workflow's dist-freshness gate proves `dist/` matches a fresh build,
 * and this suite proves that build WORKS: the entry guard fires, the default
 * runtime composes, outputs and state land in the runner files, and `post`
 * reads back what `main` saved. Locally, run `pnpm build` first — this suite
 * tests whatever `dist/` holds.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const distDir = `${repoRoot}dist`;
const bundles = ["main.js", "post.js"].map((file) => ({
	file,
	source: readFileSync(`${distDir}/${file}`, "utf8"),
}));

/** The committed JSON Schema document the payload names. */
const committedDocument = JSON.parse(readFileSync(`${repoRoot}schemas/${RunResultIdentity.fileName}`, "utf8")) as {
	readonly $id: string;
	readonly $ref: string;
	readonly $defs: Record<string, { readonly required: ReadonlyArray<string> }>;
};

describe("dist/ run as the runner runs it", () => {
	it("greets with the manifest defaults, publishes every output, and post reads main's state", () => {
		const { main, post } = runBundle({ distDir, inputs: runnerInputs() });
		assert.strictEqual(main.status, 0, main.stdout + main.stderr);
		assert.strictEqual(post.status, 0, post.stdout + post.stderr);

		// Every output action.yml declares, written by the bundle.
		assert.deepStrictEqual(Object.keys(main.outputs).sort(), [...readManifest().outputs].sort());
		assert.strictEqual(main.outputs.greeting, "Hello, world.");
		const result = JSON.parse(main.outputs.result ?? "null") as Record<string, unknown>;
		assert.deepStrictEqual(result, {
			$schema: RunResultIdentity.$id,
			greeting: "Hello, world.",
			summaryWritten: true,
			dryRun: false,
		});

		// The payload names the committed document, and carries exactly the
		// properties that document requires.
		assert.strictEqual(result.$schema, committedDocument.$id);
		const definition = committedDocument.$defs[committedDocument.$ref.replace("#/$defs/", "")];
		assert.isDefined(definition);
		assert.deepStrictEqual(Object.keys(result).sort(), [...(definition?.required ?? [])].sort());

		assert.include(main.summary, "Greeting Report");
		assert.include(main.stdout, "Run context:");
		// The phase boundary: main saved, post reported.
		assert.property(main.state, "startTime");
		assert.match(post.stdout, /Action completed in \d+\.\d{2}s/);
	});

	it("honours supplied inputs, including the line list and a disabled summary", () => {
		const { main } = runBundle({
			distDir,
			inputs: runnerInputs({ name: "bundle", guests: "- Ada\n- Grace\n", emphatic: "true", "write-summary": "false" }),
		});
		assert.strictEqual(main.status, 0, main.stdout + main.stderr);
		assert.strictEqual(main.outputs.greeting, "Hello, bundle, Ada and Grace!");
		assert.strictEqual(main.summary, "");
		assert.include(main.stdout, "Step: Write job summary — SKIPPED: disabled by the write-summary input");
	});

	it("renders ::debug:: lines only under step debugging", () => {
		const debug = runBundle({ distDir, inputs: runnerInputs(), runner: { RUNNER_DEBUG: "1" } });
		assert.include(debug.main.stdout, "::debug::Decoded inputs:");
		assert.include(debug.post.stdout, "::debug::Running post-action script");
		const quiet = runBundle({ distDir, inputs: runnerInputs() });
		assert.notInclude(quiet.main.stdout, "::debug::");
	});

	it("fails the job on a malformed input, still publishing the baseline, and post stays green", () => {
		const { main, post } = runBundle({ distDir, inputs: runnerInputs({ emphatic: "yes" }) });
		assert.notStrictEqual(main.status, 0);
		assert.include(main.stdout, "::error::");
		assert.strictEqual(main.outputs.greeting, "");
		assert.strictEqual(post.status, 0);
	});
});

describe("dist/ carries no heavy engine", () => {
	// Each is confined upstream to modules this action never imports: ajv to
	// `@effected/schemastore-cli` (a devDependency), Azure to the cache/artifact
	// tier, Sigstore to `@effected/sbom`, octokit to `@effected/github`.
	const forbidden = ["ajv", "@azure", "sigstore", "octokit"];

	it("scans real bundle content (the control)", () => {
		// Without this, an empty or unreadable file would pass every absence
		// check below.
		for (const { source } of bundles) {
			assert.include(source, "GITHUB_OUTPUT");
		}
	});

	for (const needle of forbidden) {
		it(`contains no ${needle}`, () => {
			for (const { file, source } of bundles) {
				assert.notInclude(source.toLowerCase(), needle, `${needle} reached dist/${file}`);
			}
		});
	}
});
