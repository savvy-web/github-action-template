/**
 * Global Vitest setup — runs once before all test files, in the process the
 * fork pool inherits its environment from.
 *
 * @remarks
 * Keeps the suite hermetic when it runs INSIDE a GitHub Actions runner: the
 * entry points (`src/main.ts`, `src/post.ts`) execute `Action.run` behind a
 * `GITHUB_ACTIONS` guard, so a CI test process that imports them with the
 * variable set would run the action mid-suite. Ambient `INPUT_*` variables
 * would likewise leak the workflow's own inputs into `ActionInput` reads.
 */
export function setup(): void {
	delete process.env.GITHUB_ACTIONS;
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("INPUT_") || name.startsWith("STATE_")) {
			delete process.env[name];
		}
	}
}
