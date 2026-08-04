/**
 * Main entry point: guard and run, nothing else.
 *
 * @remarks
 * The program lives in `program.ts` so tests import it without module-level
 * execution. The `GITHUB_ACTIONS` guard is the uniform entry idiom on every
 * entry file, and one of the two sanctioned ambient-`process.env` bridge
 * sites (the other is `post.ts`): everywhere else, environment access goes
 * through `ActionEnvironment`.
 *
 * No `layer` option is passed: `Action.run`'s default runtime provides
 * everything `program` requires, and the input-dependent `DryRun` layer is
 * provided inside `program` itself from the decoded inputs.
 *
 * @module main
 */

import { Action } from "@effected/github-actions";
import { program } from "./program.js";

/* v8 ignore next 3 -- entry-point guard, only runs inside a GitHub Actions runner */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(program);
}
