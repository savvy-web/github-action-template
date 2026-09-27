# Getting started

This template is a **working** GitHub Action built on the [`@effected`](https://github.com/spencerbeggs/effected) Effect v4 kit. It greets, writes a job summary panel, publishes typed outputs, and reports its duration from the `post` phase — small enough to read in one sitting, complete enough that every structural convention has a live example.

## The skeleton

| Path | What it is |
| --- | --- |
| `action.yml` | The single source of input/output **names and defaults**. Code mirrors it; a test enforces the mirror. |
| `src/main.ts`, `src/post.ts` | Entry points: a `GITHUB_ACTIONS` guard around `Action.run`, nothing else. Importable by tests without executing. |
| `src/program.ts` | The pipeline: inputs → steps → output fold → report. No I/O, no formatting, no step bodies. |
| `src/steps/` | One module per step: a result type, a tagged error with a `reason` union **when the step can fail**, an explicit `R`. |
| `src/layers/app.ts` | Only what `Action.run`'s default runtime omits. Config-dependent layers take decided values (`makeAppLayer(dryRun)`). |
| `src/schema/inputs.ts` | `INPUT_NAMES` + `readInputs`: decoded once, validated once, tested separately. `guests` is the live line-list example (`ActionInput.list`). |
| `src/schema/outputs.ts` | `OUTPUT_NAMES` + the all-disabled baseline + `emitOutputs` (every output exactly once; the baseline is written **before any work**). |
| `src/schema/result.ts` | The structured `result` output's published contract: one `HostedSchema` identity, one `Schema.Class`, and a pure projection. |
| `schemastore.config.ts` | Declares the committed JSON Schema for `result`, built from that same class and identity by the `schemastore` command. See [the output-schema chapter](./04-output-schema.md). |
| `src/shims/` | Tracked local stand-ins for kit surfaces checked absent — today `step-debug.ts` (step debugging → `Debug` log level). See the shim register in `CLAUDE.md`. |
| `src/state.ts` | Cross-phase state as Schema classes with JSON-safe encoded forms. |
| `src/format.ts` | The single rendering surface: every human-readable string, pure. |
| `__test__/unit/` | `it.effect` + `assert` suites mirroring `src/`, plus the structural guards. |
| `__test__/integration/` | `bundle.int.test.ts`: the committed `dist/` run as two real Node processes over temp runner files — bundle truth. |
| `__test__/utils/` | Recording doubles over the kit's `layerTest` layers, the `action.yml` manifest decoder, and the runner-file harness. Not tests. |

## The loop

```sh
pnpm install         # configDependencies provide the effect catalogs
pnpm test            # vitest + strict coverage; the structural guards run here
pnpm build           # turbo → types:check + schema:build → github-action-builder → dist/ + .github/actions/local/
pnpm local           # run the built dist/ main then post over temp runner files (input=value …, --debug)
pnpm validate        # builder sanity checks against action.yml
pnpm schema:build    # regenerate schemas/ from src/schema/result.ts (schemastore build)
pnpm schema:check    # the drift gate, on its own (schemastore check; CI runs it)
```

`dist/` and `.github/actions/local/` are **committed**: the runner executes those files, and the `Test` workflow's dist-freshness job rebuilds and diffs them so a stale bundle cannot merge. The integration suite runs that committed `dist/` (so run `pnpm build` before `pnpm test` after a source change), and `pnpm local` runs it by hand. The `Local Test` workflow — on every pull request, or via `act` (preconfigured in `.actrc`) — is the self-dogfood loop: the action runs itself from the committed local bundle on a real runner, and its `result` payloads are validated against the committed schema.

## Growing it into your action

1. **Freeze the I/O contract first.** Edit `action.yml`, then let the failing sync tests walk you through `schema/inputs.ts` and `schema/outputs.ts` — names AND defaults are checked against the manifest. Prefer line-list inputs (`guests` is the example); reach for a JSON input only for genuinely nested structure — and then publish its schema (the `effected` plugin's skills cover this).
2. **Add a step per concern** under `src/steps/`, deciding its failure posture at design time: fail the job, degrade to a warning (see `write-summary.ts`), or double-net it (see `post.ts`). An error class exists only if the step constructs it.
3. **Publish structured output through one schema and one identity.** `src/schema/result.ts` is both the `setJson` encoder and the source the committed JSON Schema is generated from, and its `HostedSchema` names the document; never write a second shape for it. Flip the entry to `published: true` at your first real release. No structured output? [Remove it](./04-output-schema.md#remove-the-structured-output).
4. **Keep every rendered string in `format.ts`** and every skipped step logging `Step: X — SKIPPED: <reason>` — the program suite asserts on the log stream.
5. **Add services to `makeAppLayer`** only when the default runtime doesn't already provide them — and keep `__test__/unit/layers/app.test.ts` green: it is a compile-time, two-sided proof that neither the layer nor the program requires anything `Action.run` does not supply.
6. Need GitHub App credentials? Follow [the App-auth chapter](./02-github-app-auth.md).

The [effected Claude Code plugin](https://github.com/spencerbeggs/effected) is enabled by default in `.claude/settings.json`; its `building-a-github-action` skill routes every capability question (cache, artifacts, check runs, publishing, attestation) to the right `@effected` package, and `designing-an-action` sequences a full build.
