# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

A **working template** for building GitHub Marketplace actions on the [`@effected`](https://github.com/spencerbeggs/effected) Effect v4 kit, bundled by `@savvy-web/github-action-builder`. The shipped action is a deliberately small demo (greet → job summary → typed outputs → post-phase duration) whose value is its structure: every convention has one live, tested example.

The **effected Claude Code plugin is enabled by default** (`.claude/settings.json`) and carries the system knowledge — start at its `building-a-github-action` skill to route any capability question, `designing-an-action` to sequence a new build, and the `action-engineer` agent for whole tasks. This file covers only what is repo-specific; do not expect it to restate kit APIs.

## Bootstrapping this template

To turn a fresh copy of this repository into your own action, invoke the plugin's **`bootstrapping-an-action`** skill (`/effected:bootstrapping-an-action`). It is user-invoked only — never auto-loaded — and runs a fixed eight-question interview, writes one plan file under `.claude/plans/`, then hands off to the `action-engineer` agent running `designing-an-action`. Do not hand-edit the scaffold into a new action instead; the interview records decisions the canon forces (phases, GitHub access, line-list vs JSON inputs, whether outputs publish a versioned schema) that the build sequence depends on.

The skill ships in the **`effected` plugin from the `spencerbeggs/effected` marketplace**, enabled here as `effected@spencerbeggs` in `.claude/settings.json`. The dev container registers that marketplace in `.devcontainer/postCreate.sh`. To verify it loaded outside the container:

```sh
claude plugin marketplace add spencerbeggs/effected   # once, if not already registered
claude plugin list                                    # `effected@spencerbeggs` must appear enabled
```

If it does not appear, the skills below are absent and the guidance in this file has no backing — fix the plugin before building. Working against a local checkout of the plugin instead: `pnpm claude`, which passes `--plugin-dir=../../spencerbeggs/effected/plugins/claude-code`.

## Layout

- `action.yml` — the single source of input/output names AND defaults. Code mirrors it; `__test__/unit/schema/*.test.ts` enforce the mirror three ways (declared ↔ tuple ↔ actually-read).
- `src/` — entry points (`main.ts`, `post.ts`, guard + `Action.run` only), `program.ts` (pure composition), `steps/` (one module per step), `layers/app.ts`, `schema/` (`inputs.ts`, `outputs.ts`, and `result.ts` — the published `result` output contract), `state.ts`, `format.ts` (every rendered string). Conventions: `src/CLAUDE.md`.
- `__test__/` — `unit/` mirrors `src/`; `utils/` holds recording doubles (not tests). Conventions: `__test__/CLAUDE.md`.
- `dist/` + `.github/actions/local/` — **committed** bundles; the runner executes these, and the `Test` workflow rebuilds and diffs them (dist freshness). Never hand-edit.
- `lib/scripts/generate-schema.ts` + `schemas/<version>/` — the JSON Schema for the `result` output and the committed document it emits. The script gates on `SchemaPipeline.check` before writing; the artifact is **generated, never hand-edited**, and `__test__/unit/generate-schema.test.ts` imports the script's own exported `targets` to pin it.
- `docs/` — getting started, the optional GitHub App auth module, the bundler forensic notes, and the output-schema contract.
- `.repos/` — read-only vendored upstream source, pinned to the version this repo installs (`effect` at `effect@4.0.0-rc.109`). Never edit it; the tree is filesystem-locked. Read it to settle what v4 actually exports, and re-pin it in the SAME commit as any `effect` catalog bump (`/silk:repos`).

## Commands

- `pnpm test` — vitest (`it.effect` + `assert`, strict coverage). Read the `Tests:` line, not the exit code, when scoping a subset.
- `pnpm build` — turbo: `types:check` then `github-action-builder build` → `dist/` and `.github/actions/local/`. Never run the builder directly outside turbo.
- `pnpm validate` — builder checks against `action.yml`.
- `pnpm schema:generate` / `pnpm schema:check` — regenerate the committed `result` schema (gated: aborts on a contract change until the version label and `$id` move together), and run the drift test over the generator's exported `targets`.
- `pnpm lint` / `lint:fix` / `lint:md` — Biome and markdownlint via the silk presets.

## Repo-specific rules

- **Entry idiom is uniform**: `if (process.env.GITHUB_ACTIONS) { await Action.run(...) }` with a `v8 ignore` comment, on every entry file. Those guards (plus `vitest.setup.ts`, which strips `GITHUB_ACTIONS`/`INPUT_*`/`STATE_*` so CI test processes stay hermetic) are the only sanctioned ambient `process.env` reads — everything else goes through `ActionEnvironment`.
- **`action.yml` owns names and defaults.** Change inputs/outputs there first, then follow the failing sync tests.
- **An error class exists only if src constructs it**, and each step decides its failure posture at design time (fail-the-job / degrade-to-warning / double-netted). `post` never fails the workflow.
- **Dependency honesty is tested**: every `dependencies` entry must be imported by `src/` or peer-required by one that is (`__test__/unit/structure.test.ts` resolves the peer closure). Add a dep only with its import.
- **Outputs are emitted before any work.** `program.ts` writes the full baseline as its first statement, never from an `Effect.onError` handler — a failure handler that re-emits the baseline overwrites an output describing work that actually happened. A step whose result must survive a later failure emits its own output as soon as it lands.
- **Adding a service the default runtime does not supply must fail to COMPILE.** `__test__/unit/layers/app.test.ts` asserts it two-sided — over the app layer's requirements AND, separately, over the program's — because a service resolved inside a step *method* is invisible to the layer's input channel. A runtime check is not a substitute; a compile failure cannot regress silently.
- **Structural guards live in the suite** — test placement (`unit/` or `integration/*.int.test.ts`, nowhere else) and the `@effect/vitest` harness are asserted, not assumed.

## Shim register

Local stand-ins for kit surfaces that were checked and found absent live in `src/shims/<contract>.ts`, one module per missing contract. **Currently empty — re-audited construct-by-construct against `@effected/github-actions@0.10.2` (2026-09-04); the kit covers everything this template uses.** Restamp this claim with the version and date at every kit bump; an unstamped "currently empty" is the fossil this register exists to prevent.

Each shim's header must record: the surfaces checked absent and at which kit versions, the tracking issue, and the removal condition. Protocol when you spot code that belongs upstream in `@effected/*`: **ask the user** whether to dogfood the change upstream now or shim it here — and either way file an issue in `spencerbeggs/effected` plus a linked tracking ticket in this repo. Re-audit this register (and every kit-surface claim in comments and docs) on every `@effected/*` version bump; a fossilized "the kit doesn't ship X" comment is the recorded failure mode.
