# src/ conventions

Structure rules for the action's source. Kit API depth lives in the effected plugin's skills, not here.

## Module roles

- `main.ts` / `post.ts` — entry points: the uniform `GITHUB_ACTIONS` guard around `Action.run`, nothing else. Programs stay importable without execution.
- `program.ts` — pure composition: **baseline outputs first** → `readInputs` → steps in runner order (each in an `ActionLogger.group`) → the output fold → the closing report. No I/O of its own, no formatting, no step bodies. Holds only cross-step joins.
- `steps/` — one module per orchestration unit. The step contract: a result type, a `Data.TaggedError` with a `reason` literal union **when the step can fail**, and an explicitly annotated `R`. Decide the failure posture per step and write it in the module doc: fail-the-job, degrade-to-warning (shape the error, log it, return the honest result — `write-summary.ts`), or double-netted (`post.ts`).
- `services/` (create when needed) — reusable `Context.Service` classes, only for capability shared across steps or actions. A step used once does not become a service.
- `shims/` — tracked local stand-ins for kit surfaces checked absent; see the shim register in the root `CLAUDE.md`. Today: `step-debug.ts` (`withStepDebug`), applied ONCE at the top of each phase's program (`program.ts`, `post.ts`) so `RUNNER_DEBUG=1` lowers the minimum log level to `Debug`. Each shim's header names the surfaces checked absent, the issues, and the removal condition.
- `layers/app.ts` — only what `Action.run`'s default runtime omits; require the rest, never rebuild. Config-dependent layers take decided values (`makeAppLayer(dryRun)`); config-independent layers are static `const`s (layers memoize by reference).
- `schema/inputs.ts` — `INPUT_NAMES` as data + `readInputs` decoded once with cross-field validation. Defaults mirror `action.yml`; the sync test enforces the mirror, names AND defaults. Read every input through an `ActionInput` accessor; a multi-value input is a line list (`guests` via `ActionInput.list`, with `Config.withDefault([])` load-bearing because the runner publishes `""` for an omitted input).
- `schema/outputs.ts` — `OUTPUT_NAMES` + the all-disabled baseline + `emitOutputs`. The baseline is emitted **before any work** — before `readInputs`, the earliest thing that can abort — so every output has a value on every exit path; later writes only refine it. An `Effect.onError` handler that re-emits the baseline is the recorded anti-pattern this module used to carry: it overwrites an output describing work that actually happened. A step whose result must survive a later failure emits its own output as soon as it lands.
- `schema/result.ts` — the structured `result` output's published contract. `RunResultIdentity` (a `HostedSchema`) is the one identity: the payload's `$schema` is `Schema.Literal(RunResultIdentity.$id)` and `schemastore.config.ts` passes the same value as `hosted`. ONE `Schema.Class`, `RunResult`, feeds both `ActionOutputs.setJson` (which takes the schema as its encoder) and the config entry; `toRunResult` is the pure projection from the internal model. Field prose goes in each field's `description`; the document's `title`/`description` go on the inner `Schema.Struct` passed to `Schema.Class` (class-level annotations do not reach the document). A machine-reader hint may use the declared `x-ai-*` family (`x-ai-hint`); any other custom key is never published — not emitted, or refused with `UndeclaredAnnotationKeyError`.
- `state.ts` — cross-phase state as `Schema.Class` bundles under `STATE_KEYS`. Every field's encoded form must be plain JSON: `Schema.OptionFromNullOr`, never `Schema.Option`.
- `schemastore.config.ts` (repo root, outside `src/`) — the schema publication config the `schemastore` command reads; it imports from `schema/result.ts`, never the reverse. `src` imports `@effected/schemastore` only for `HostedSchema` (engine-free; ajv stays in the `@effected/schemastore-cli` devDependency, and the bundle-truth test asserts it never reaches `dist/`). Never hand-edit `schemas/**`; see `docs/04-output-schema.md`.
- `format.ts` — every human-readable string, pure and service-free. A fact shown in two surfaces goes through one function. Markdown through the kit's `GitHubMarkdown` only.

## The logging contract

The minimum level follows the runner's step debugging (`shims/step-debug.ts`): `Effect.logDebug` is filtered at `Info` normally and rendered as `::debug::` under `RUNNER_DEBUG=1`. Run-context block first; a detect-headline (`X composed/detected: <decision>`) per step; every skipped step logs `Step: X — SKIPPED: <reason>` (via `format.formatSkipped`); warnings reserved for acceptance signals; a closing `Result:` block. The program suite asserts on the captured stream — change the contract and the tests together.

## Rules that bite

- Never `setFailed`-and-return where the effect should fail — the job's verdict comes from the error channel.
- No `as never` (or any cast) on an effect's `R`: a dropped layer must fail to compile.
- `ActionEnvironment` is the only environment source; the entry guards are the sanctioned exceptions.
- Time goes through `Clock` (`Clock.currentTimeMillis`), never `Date.now()` — a test pins it with `TestClock`.
- No error class without a constructor site; no `new Error` where a step failure needs a tag.
- Adding a service that `Action.run`'s runtime does not supply must fail to COMPILE: `__test__/unit/layers/app.test.ts` proves it from both sides — the layer's input channel and the program's requirement channel. The second half is not a restatement; a service resolved inside a step METHOD never enters any layer's input channel.
