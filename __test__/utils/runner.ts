/**
 * A runner-file harness: executes the BUILT bundles (`dist/main.js`, then
 * `dist/post.js`) as separate Node processes the way a GitHub runner does,
 * and reads back what they wrote.
 *
 * Helper code only, never a test. Shared by
 * `__test__/integration/bundle.int.test.ts` and `lib/scripts/run-local.ts`
 * (`pnpm local`).
 *
 * @remarks
 * What it reproduces of the runner's contract:
 *
 * - `GITHUB_ACTIONS=true`, so the entry guards run `Action.run`.
 * - Fresh, empty `GITHUB_OUTPUT` / `GITHUB_STATE` / `GITHUB_STEP_SUMMARY` /
 *   `GITHUB_ENV` / `GITHUB_PATH` files per phase, in a temp directory
 *   removed afterwards.
 * - The inputs exactly as the caller built them — use
 *   `manifest.ts`'s `runnerInputs`, so every declared input is present.
 * - The phase boundary: `main`'s `GITHUB_STATE` entries are republished to
 *   `post` as `STATE_<key>` variables, and nothing else crosses.
 *
 * The child environment is built from scratch (only `PATH`, `HOME` and
 * `SystemRoot` are inherited), so a workflow's own `INPUT_*` / `STATE_*` /
 * `GITHUB_*` variables can never leak into a run.
 *
 * Deliberately free of RELATIVE value imports: `pnpm local` runs through
 * Node's own type stripping, which does not map a `.js` specifier to its
 * `.ts` source the way vitest and the bundler do.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What one phase did. */
export interface PhaseRun {
	/** The process exit code (`null` when killed by a signal). */
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	/** `GITHUB_OUTPUT`, parsed. */
	readonly outputs: Readonly<Record<string, string>>;
	/** `GITHUB_STATE`, parsed. */
	readonly state: Readonly<Record<string, string>>;
	/** `GITHUB_STEP_SUMMARY`, raw. */
	readonly summary: string;
}

/** A full `main` → runner → `post` run. */
export interface ActionRun {
	readonly main: PhaseRun;
	readonly post: PhaseRun;
}

/** Options for {@link runBundle}. */
export interface RunBundleOptions {
	/** The directory holding `main.js` and `post.js`. */
	readonly distDir: string;
	/** The `INPUT_*` environment — build it with `runnerInputs`. */
	readonly inputs: Readonly<Record<string, string>>;
	/** Extra runner variables (`RUNNER_DEBUG`, …). */
	readonly runner?: Readonly<Record<string, string>>;
}

/**
 * Parses a runner file the way the runner does: `name<<DELIMITER` heredoc
 * blocks (what `@effected/github-actions` writes) and single-line
 * `name=value` entries.
 */
export const parseRunnerFile = (raw: string): Record<string, string> => {
	const lines = raw.split("\n");
	const entries: Record<string, string> = {};
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const heredoc = /^(.+?)<<(.+)$/.exec(line);
		if (heredoc !== null) {
			const key = heredoc[1] ?? "";
			const delimiter = heredoc[2] ?? "";
			const body: Array<string> = [];
			index++;
			while (index < lines.length && lines[index] !== delimiter) {
				body.push(lines[index] ?? "");
				index++;
			}
			entries[key] = body.join("\n");
			continue;
		}
		const separator = line.indexOf("=");
		if (separator > 0) {
			entries[line.slice(0, separator)] = line.slice(separator + 1);
		}
	}
	return entries;
};

/** The only ambient variables a child inherits. */
const inherited = (): Record<string, string> => {
	const env: Record<string, string> = {};
	for (const name of ["PATH", "HOME", "SystemRoot"]) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
};

const runPhase = (
	directory: string,
	phase: "main" | "post",
	script: string,
	env: Readonly<Record<string, string>>,
): PhaseRun => {
	const files = {
		GITHUB_OUTPUT: join(directory, `${phase}.output`),
		GITHUB_STATE: join(directory, `${phase}.state`),
		GITHUB_STEP_SUMMARY: join(directory, `${phase}.summary`),
		GITHUB_ENV: join(directory, `${phase}.env`),
		GITHUB_PATH: join(directory, `${phase}.path`),
	};
	for (const file of Object.values(files)) writeFileSync(file, "");
	const result = spawnSync(process.execPath, [script], {
		env: { ...env, ...files },
		encoding: "utf8",
		timeout: 30_000,
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		outputs: parseRunnerFile(readFileSync(files.GITHUB_OUTPUT, "utf8")),
		state: parseRunnerFile(readFileSync(files.GITHUB_STATE, "utf8")),
		summary: readFileSync(files.GITHUB_STEP_SUMMARY, "utf8"),
	};
};

/**
 * Runs `main` then `post` from `distDir`, the way the runner sequences them:
 * `post` runs even when `main` failed, and sees only `main`'s saved state.
 */
export const runBundle = (options: RunBundleOptions): ActionRun => {
	const directory = mkdtempSync(join(tmpdir(), "action-run-"));
	try {
		const base = {
			...inherited(),
			GITHUB_ACTIONS: "true",
			RUNNER_TEMP: directory,
			...options.runner,
			...options.inputs,
		};
		const main = runPhase(directory, "main", join(options.distDir, "main.js"), base);
		const republished: Record<string, string> = {};
		for (const [key, value] of Object.entries(main.state)) republished[`STATE_${key}`] = value;
		const post = runPhase(directory, "post", join(options.distDir, "post.js"), { ...base, ...republished });
		return { main, post };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};
