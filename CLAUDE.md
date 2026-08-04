# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

A **working template** for building GitHub Marketplace actions on the [`@effected`](https://github.com/spencerbeggs/effected) Effect v4 kit, bundled by `@savvy-web/github-action-builder`. The shipped action is a deliberately small demo (greet → job summary → typed outputs → post-phase duration) whose value is its structure: every convention has one live, tested example.

The **effected Claude Code plugin is enabled by default** (`.claude/settings.json`) and carries the system knowledge — start at its `building-a-github-action` skill to route any capability question, `designing-an-action` to sequence a new build, and the `action-engineer` agent for whole tasks. This file covers only what is repo-specific; do not expect it to restate kit APIs.

## Layout

- `action.yml` — the single source of input/output names AND defaults. Code mirrors it; `__test__/unit/schema/*.test.ts` enforce the mirror three ways (declared ↔ tuple ↔ actually-read).
- `src/` — entry points (`main.ts`, `post.ts`, guard + `Action.run` only), `program.ts` (pure composition), `steps/` (one module per step), `layers/app.ts`, `schema/`, `state.ts`, `format.ts` (every rendered string). Conventions: `src/CLAUDE.md`.
- `__test__/` — `unit/` mirrors `src/`; `utils/` holds recording doubles (not tests). Conventions: `__test__/CLAUDE.md`.
- `dist/` + `.github/actions/local/` — **committed** bundles; the runner executes these, and the `Test` workflow rebuilds and diffs them (dist freshness). Never hand-edit.
- `docs/` — getting started, the optional GitHub App auth module, and the bundler forensic notes.

## Commands

- `pnpm test` — vitest (`it.effect` + `assert`, strict coverage). Read the `Tests:` line, not the exit code, when scoping a subset.
- `pnpm build` — turbo: `types:check` then `github-action-builder build` → `dist/` and `.github/actions/local/`. Never run the builder directly outside turbo.
- `pnpm validate` — builder checks against `action.yml`.
- `pnpm lint` / `lint:fix` / `lint:md` — Biome and markdownlint via the silk presets.

## Repo-specific rules

- **Entry idiom is uniform**: `if (process.env.GITHUB_ACTIONS) { await Action.run(...) }` with a `v8 ignore` comment, on every entry file. Those guards (plus `vitest.setup.ts`, which strips `GITHUB_ACTIONS`/`INPUT_*`/`STATE_*` so CI test processes stay hermetic) are the only sanctioned ambient `process.env` reads — everything else goes through `ActionEnvironment`.
- **`action.yml` owns names and defaults.** Change inputs/outputs there first, then follow the failing sync tests.
- **An error class exists only if src constructs it**, and each step decides its failure posture at design time (fail-the-job / degrade-to-warning / double-netted). `post` never fails the workflow.
- **Dependency honesty is tested**: every `dependencies` entry must be imported by `src/` or peer-required by one that is (`__test__/unit/structure.test.ts` resolves the peer closure). Add a dep only with its import.
- **Structural guards live in the suite** — test placement (`unit/` or `integration/*.int.test.ts`, nowhere else) and the `@effect/vitest` harness are asserted, not assumed.

## Shim register

Local stand-ins for kit surfaces that were checked and found absent live in `src/shims/<contract>.ts`, one module per missing contract. **Currently empty — the kit covers everything this template uses.**

Each shim's header must record: the surfaces checked absent and at which kit versions, the tracking issue, and the removal condition. Protocol when you spot code that belongs upstream in `@effected/*`: **ask the user** whether to dogfood the change upstream now or shim it here — and either way file an issue in `spencerbeggs/effected` plus a linked tracking ticket in this repo. Re-audit this register (and every kit-surface claim in comments and docs) on every `@effected/*` version bump; a fossilized "the kit doesn't ship X" comment is the recorded failure mode.
