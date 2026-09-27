/**
 * `action.yml`, decoded — the one place the suite (and the local runner
 * harness) reads the manifest.
 *
 * Helper code only, never a test (see `__test__/CLAUDE.md`).
 *
 * @remarks
 * **A local stand-in for a proposed upstream construct.** The kit surface
 * checked absent at `@effected/github-actions@0.17.0`: nothing decodes an
 * action manifest (input/output names, defaults, `required`), and nothing
 * builds the runner-shaped input environment the kit itself warns a suite to
 * arrange (`ActionInput.string`'s TSDoc: "the runner publishes a variable for
 * every declared input … a bare test environment inverts the unsupplied
 * case"). Upstream: https://github.com/spencerbeggs/effected/issues/856 —
 * tracked here in https://github.com/savvy-web/github-action-template/issues/112.
 * Removal condition: `@effected/github-actions` ships an `ActionManifest`
 * construct covering the decode AND the runner-shaped test environment; delete
 * this module and point every importer at it.
 *
 * Why this exists at all: `action.yml` owns input/output names AND defaults,
 * and the code mirrors both. Comparing names alone leaves the defaults
 * unenforced, and a suite that injects an empty `ActionInput.layer({})` tests
 * the "genuinely absent" case — which no runner ever produces — so it
 * exercises the code's `Config.withDefault` fallbacks rather than the manifest
 * defaults production actually runs on. {@link runnerInputs} builds the
 * environment the runner does build.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ActionInput } from "@effected/github-actions";
import { Yaml } from "@effected/yaml";
import { Schema } from "effect";

/**
 * One declared input. `default` is absent when the manifest declares none —
 * the runner then publishes the input as `""` when a workflow omits it.
 */
const ManifestInput = Schema.Struct({
	description: Schema.String,
	required: Schema.optionalKey(Schema.Boolean),
	// YAML types an unquoted `default: true` as a boolean and `default: 3` as a
	// number; the runner publishes every default as TEXT. Accept all three and
	// normalize in `decodeManifest`, so a manifest author's quoting choice
	// cannot change what the suite believes the runner sends.
	default: Schema.optionalKey(Schema.Union([Schema.String, Schema.Boolean, Schema.Number])),
});

/** One declared output. */
const ManifestOutput = Schema.Struct({
	description: Schema.String,
});

/**
 * The slice of `action.yml` the mirror rule is about. Other keys (`name`,
 * `branding`, `runs`, …) are tolerated, not described.
 */
const ActionManifestSchema = Schema.Struct({
	inputs: Schema.optionalKey(Schema.Record(Schema.String, ManifestInput)),
	outputs: Schema.optionalKey(Schema.Record(Schema.String, ManifestOutput)),
});

const ActionManifestFromYaml = Yaml.schema(ActionManifestSchema);

/**
 * A declared input, normalized: `default` is the exact text the runner
 * publishes when a workflow omits the input — the manifest default, or `""`.
 */
export interface DeclaredInput {
	readonly name: string;
	readonly required: boolean;
	readonly default: string;
	/** Whether the manifest declares a `default` at all. */
	readonly hasDefault: boolean;
}

/**
 * The decoded manifest: inputs and outputs in declaration order.
 */
export interface ActionManifest {
	readonly inputs: ReadonlyArray<DeclaredInput>;
	readonly outputs: ReadonlyArray<string>;
}

/** The repository's own `action.yml`. */
export const MANIFEST_PATH = fileURLToPath(new URL("../../action.yml", import.meta.url));

/**
 * Decodes an `action.yml` document. Throws on a manifest that does not parse
 * or does not match the shape — in a test, a loud failure is the right one.
 */
export const decodeManifest = (text: string): ActionManifest => {
	const raw = Schema.decodeUnknownSync(ActionManifestFromYaml)(text);
	return {
		inputs: Object.entries(raw.inputs ?? {}).map(([name, input]) => ({
			name,
			required: input.required ?? false,
			default: input.default === undefined ? "" : String(input.default),
			hasDefault: input.default !== undefined,
		})),
		outputs: Object.keys(raw.outputs ?? {}),
	};
};

/** The repository's own manifest, read from disk. */
export const readManifest = (path: string = MANIFEST_PATH): ActionManifest =>
	decodeManifest(readFileSync(path, "utf8"));

/**
 * The input environment a real runner builds: EVERY declared input present,
 * keyed by its runner variable (`INPUT_<MANGLED>`, derived by the kit's own
 * `ActionInput.variable`, never spelled here), carrying the workflow-supplied
 * value when there is one and the manifest default — or `""` — otherwise.
 *
 * @remarks
 * Keyed by runner variable rather than input name so the same record serves
 * both `ActionInput.layer(...)` (which reads `INPUT_`-spelled keys verbatim)
 * and a spawned `dist/*.js` process's real environment. A supplied key that
 * the manifest does not declare throws: the runner would drop it, and a test
 * relying on it would be testing nothing.
 */
export const runnerInputs = (
	supplied: Readonly<Record<string, string>> = {},
	manifest: ActionManifest = readManifest(),
): Record<string, string> => {
	const declared = new Set(manifest.inputs.map((input) => input.name));
	const undeclared = Object.keys(supplied).filter((name) => !declared.has(name));
	if (undeclared.length > 0) {
		throw new Error(`runnerInputs: not declared in action.yml: ${undeclared.join(", ")}`);
	}
	const env: Record<string, string> = {};
	for (const input of manifest.inputs) {
		env[ActionInput.variable(input.name)] = supplied[input.name] ?? input.default;
	}
	return env;
};
