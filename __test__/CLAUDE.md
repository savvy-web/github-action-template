# __test__/ conventions

## Harness

`@effect/vitest`: `it.effect` + `Effect.gen` as the default runner, `assert.*` — never `expect`. The structural suite (`unit/structure.test.ts`) asserts every test file imports `@effect/vitest`, so a drift back to plain vitest fails loudly.

## The collection contract

Tests live in `unit/` (mirroring `src/` per module) or `integration/` (as `*.int.test.ts`), __nowhere else__ — `unit/structure.test.ts` enforces placement, because a test file a project-scoped runner does not collect is indistinguishable from a green one. `utils/` holds helper code only, never tests. When scoping a run, gate on the reported `Tests:` count, never the exit code — a filtered run that matches nothing exits 0.

## Doubles

`utils/doubles.ts` wraps the kit's `layerTest` doubles with recorders. The kit's unstubbed members die loudly by design (the recorded exceptions: `ActionLogger`, `ActionEnvironment`, `DryRun` — services whose safe default is real); stub exactly what a suite exercises. Recording happens inside the effect, never eagerly at construction, so a described-but-never-run call cannot appear in a recording.

The `ActionOutputs` double records `setJson` writes ENCODED — through the caller's schema and `JSON.stringify`ed, exactly as the runner would see them — rather than the in-memory object; a double that recorded the object would pass while the published payload was unencodable, which is the one failure `setJson` exists to catch.

## Manifest and runner harness

`utils/manifest.ts` decodes `action.yml` (through `@effected/yaml`) into names, defaults and `required`, and builds the RUNNER-SHAPED input environment with `runnerInputs(supplied)`: every declared input present under its runner variable (`ActionInput.variable`, never spelled by hand), carrying the supplied value, else its manifest default, else `""`. Arrange inputs with it — an empty `ActionInput.layer({})` is "genuinely absent", a state no runner produces, and exercises the code's fallbacks instead of the manifest's defaults. It is a tracked stand-in for a proposed kit `ActionManifest` (effected#856 / #112); its header carries the removal condition.

`utils/runner.ts` runs the built bundles as a runner does — `dist/main.js`, then `dist/post.js` with `main`'s `GITHUB_STATE` republished as `STATE_*` — over temp runner files, and parses what they wrote (`parseRunnerFile`, also used by `unit/state.test.ts`). It inherits only `PATH`/`HOME`/`SystemRoot`, and has no relative value imports so `pnpm local` (Node type stripping) can load it.

The `ActionState` double encodes through each caller's schema and stores JSON text — a round trip through it proves the schema survives the phase boundary. The full-fidelity version is `unit/state.test.ts`, which drives the REAL `ActionState.layer` over a temp `GITHUB_STATE` file and replays the runner's republish step.

## What the suites pin

- `schema/inputs.test.ts` / `schema/outputs.test.ts` — the sync: `action.yml` decoded for real ↔ the NAMES tuples ↔ what the code actually reads/writes, plus DEFAULTS — the runner-shaped environment must decode to exactly what an empty one does (the code's own `withDefault`s), so a default changed in either file alone fails. One read uses the runner-mangled key (`INPUT_WRITE-SUMMARY`).
- `program.test.ts` — inputs arranged runner-shaped. The log stream is the decision record: run-context block, SKIPPED reasons, result block, and `Debug` lines present only under `RUNNER_DEBUG=1` (the step-debug shim). Also pins the output ORDERING: the all-disabled baseline is written before any work (asserted as the exact `sets` name sequence), and a run that aborts inside `readInputs` still has it. Both halves die under the `Effect.onError` anti-pattern.
- `layers/app.test.ts` — the two-sided requirement proof, at COMPILE time. The `it` bodies only prove the module was evaluated; a runtime assertion would be no proof, because it can regress silently where a compile error cannot.
- `schema/result.test.ts` — the `result` contract as this action defines it (projection, JSON-safe encoding, `$schema` a literal of `RunResultIdentity.$id`). The identity is single-sourced, so there is no `$id` pin to write; drift, the version gate and freshness are `pnpm schema:check` in CI, and the schemastore kit tests its own behaviour upstream — do not re-test it here.
- `steps/*.test.ts` — each step's failure posture, including the degrade path actually degrading.
- `post.test.ts` — post can never fail the workflow, proven by injecting a defect; the duration line under a pinned `TestClock`; debug lines only under step debugging.
- `integration/bundle.int.test.ts` — bundle truth over the COMMITTED `dist/` (run `pnpm build` first locally; CI's dist-freshness job keeps the committed bundle current): main and post as real processes, every declared output written, the payload naming the committed document and carrying exactly its required properties, step-debug rendering, a malformed input failing the job with the baseline published, and no heavy engine (ajv, `@azure`, sigstore, octokit) in either bundle — with a positive control proving the scan reads real content.
- `structure.test.ts` — dependency honesty (peer-closure aware), harness canon, test placement.

Before calling a new suite done, mutate an edge it claims to cover and watch it fail.
