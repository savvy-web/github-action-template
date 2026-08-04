# src/ conventions

Structure rules for the action's source. Kit API depth lives in the effected plugin's skills, not here.

## Module roles

- `main.ts` / `post.ts` — entry points: the uniform `GITHUB_ACTIONS` guard around `Action.run`, nothing else. Programs stay importable without execution.
- `program.ts` — pure composition: `readInputs` → steps in runner order (each in an `ActionLogger.group`) → the output fold → the closing report. No I/O of its own, no formatting, no step bodies. Holds only cross-step joins.
- `steps/` — one module per orchestration unit. The step contract: a result type, a `Data.TaggedError` with a `reason` literal union **when the step can fail**, and an explicitly annotated `R`. Decide the failure posture per step and write it in the module doc: fail-the-job, degrade-to-warning (shape the error, log it, return the honest result — `write-summary.ts`), or double-netted (`post.ts`).
- `services/` (create when needed) — reusable `Context.Service` classes, only for capability shared across steps or actions. A step used once does not become a service.
- `shims/` (create when needed) — see the shim register in the root `CLAUDE.md`.
- `layers/app.ts` — only what `Action.run`'s default runtime omits; require the rest, never rebuild. Config-dependent layers take decided values (`makeAppLayer(dryRun)`); config-independent layers are static `const`s (layers memoize by reference).
- `schema/inputs.ts` — `INPUT_NAMES` as data + `readInputs` decoded once with cross-field validation. Defaults mirror `action.yml`; the sync test enforces the mirror.
- `schema/outputs.ts` — `OUTPUT_NAMES` + the all-disabled baseline + `emitOutputs`. Every output is emitted exactly once, on every exit path (success emits the fold, `Effect.onError` emits the baseline).
- `state.ts` — cross-phase state as `Schema.Class` bundles under `STATE_KEYS`. Every field's encoded form must be plain JSON: `Schema.OptionFromNullOr`, never `Schema.Option`.
- `format.ts` — every human-readable string, pure and service-free. A fact shown in two surfaces goes through one function. Markdown through the kit's `GitHubMarkdown` only.

## The logging contract

Run-context block first; a detect-headline (`X composed/detected: <decision>`) per step; every skipped step logs `Step: X — SKIPPED: <reason>` (via `format.formatSkipped`); warnings reserved for acceptance signals; a closing `Result:` block. The program suite asserts on the captured stream — change the contract and the tests together.

## Rules that bite

- Never `setFailed`-and-return where the effect should fail — the job's verdict comes from the error channel.
- No `as never` (or any cast) on an effect's `R`: a dropped layer must fail to compile.
- `ActionEnvironment` is the only environment source; the entry guards are the sanctioned exceptions.
- No error class without a constructor site; no `new Error` where a step failure needs a tag.
