/**
 * `pnpm local` — run the built action on this machine, the way a runner would.
 *
 * @remarks
 * Executes `dist/main.js` then `dist/post.js` as separate Node processes over
 * temp runner files, with every input `action.yml` declares present (the
 * supplied value, else its manifest default, else `""`), then prints what the
 * run wrote. Same harness as `__test__/integration/bundle.int.test.ts`.
 *
 * Run `pnpm build` first — this runs whatever `dist/` holds.
 *
 * ```sh
 * pnpm local                                    # all manifest defaults
 * pnpm local name=Ada guests="Grace, Linus"     # input=value pairs
 * pnpm local --debug dry-run=true               # RUNNER_DEBUG=1
 * ```
 *
 * Node runs this file through its own type stripping, which does not map the
 * `.js` specifiers the rest of the repo uses onto `.ts` sources. So the
 * helpers are imported TYPE-ONLY under their usual specifiers (erased at
 * runtime) and loaded as VALUES from their `.ts` URLs.
 *
 * @module run-local
 */

import { fileURLToPath } from "node:url";

type Manifest = typeof import("../../__test__/utils/manifest.js");
type Runner = typeof import("../../__test__/utils/runner.js");

const helper = (name: string): string => new URL(`../../__test__/utils/${name}.ts`, import.meta.url).href;
const { runnerInputs }: Manifest = await import(helper("manifest"));
const { runBundle }: Runner = await import(helper("runner"));

const args = process.argv.slice(2);
const debug = args.includes("--debug");
const supplied: Record<string, string> = {};
for (const arg of args.filter((value) => value !== "--debug")) {
	const separator = arg.indexOf("=");
	if (separator <= 0) {
		console.error(`Expected input=value, got: ${arg}`);
		process.exit(64);
	}
	supplied[arg.slice(0, separator)] = arg.slice(separator + 1);
}

const run = runBundle({
	distDir: fileURLToPath(new URL("../../dist", import.meta.url)),
	inputs: runnerInputs(supplied),
	...(debug ? { runner: { RUNNER_DEBUG: "1" } } : {}),
});

for (const [phase, result] of [
	["main", run.main],
	["post", run.post],
] as const) {
	console.log(`\n=== ${phase} (exit ${result.status}) ===`);
	process.stdout.write(result.stdout);
	if (result.stderr !== "") process.stderr.write(result.stderr);
}
console.log("\n=== outputs ===");
for (const [name, value] of Object.entries(run.main.outputs)) console.log(`${name}: ${value}`);
console.log("\n=== job summary ===");
console.log(run.main.summary === "" ? "(empty)" : run.main.summary);

process.exitCode = run.main.status === 0 && run.post.status === 0 ? 0 : 1;
