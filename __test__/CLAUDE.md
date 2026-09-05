# __test__/ conventions

## Harness

`@effect/vitest`: `it.effect` + `Effect.gen` as the default runner, `assert.*` — never `expect`. The structural suite (`unit/structure.test.ts`) asserts every test file imports `@effect/vitest`, so a drift back to plain vitest fails loudly.

## The collection contract

Tests live in `unit/` (mirroring `src/` per module) or `integration/` (as `*.int.test.ts`), __nowhere else__ — `unit/structure.test.ts` enforces placement, because a test file a project-scoped runner does not collect is indistinguishable from a green one. `utils/` holds helper code only, never tests. When scoping a run, gate on the reported `Tests:` count, never the exit code — a filtered run that matches nothing exits 0.

## Doubles

`utils/doubles.ts` wraps the kit's `layerTest` doubles with recorders. The kit's unstubbed members die loudly by design (the recorded exceptions: `ActionLogger`, `ActionEnvironment`, `DryRun` — services whose safe default is real); stub exactly what a suite exercises. Recording happens inside the effect, never eagerly at construction, so a described-but-never-run call cannot appear in a recording.

The `ActionOutputs` double records `setJson` writes ENCODED — through the caller's schema and `JSON.stringify`ed, exactly as the runner would see them — rather than the in-memory object; a double that recorded the object would pass while the published payload was unencodable, which is the one failure `setJson` exists to catch.

The `ActionState` double encodes through each caller's schema and stores JSON text — a round trip through it proves the schema survives the phase boundary. The full-fidelity version is `unit/state.test.ts`, which drives the REAL `ActionState.layer` over a temp `GITHUB_STATE` file and replays the runner's republish step.

## What the suites pin

- `schema/inputs.test.ts` / `schema/outputs.test.ts` — the three-way sync: `action.yml` parsed for real ↔ the NAMES tuples ↔ what the code actually reads/writes.
- `program.test.ts` — the log stream is the decision record: run-context block, SKIPPED reasons, result block. Also pins the output ORDERING: the all-disabled baseline is written before any work (asserted as the exact `sets` name sequence), and a run that aborts inside `readInputs` still has it. Both halves die under the `Effect.onError` anti-pattern.
- `layers/app.test.ts` — the two-sided requirement proof, at COMPILE time. The `it` bodies only prove the module was evaluated; a runtime assertion would be no proof, because it can regress silently where a compile error cannot.
- `generate-schema.test.ts` — the JSON Schema drift guard, over the generator's OWN exported `targets` and `AppLayer`. A test that rebuilds either passes while the generator emits something else. Asserts both `blocked === false` and `DocumentDiff.isClean(change)`; comparison is by parsed content, never bytes, so a formatter reflowing the committed JSON is not drift.
- `steps/*.test.ts` — each step's failure posture, including the degrade path actually degrading.
- `post.test.ts` — post can never fail the workflow, proven by injecting a defect.
- `structure.test.ts` — dependency honesty (peer-closure aware), harness canon, test placement.

Before calling a new suite done, mutate an edge it claims to cover and watch it fail.
