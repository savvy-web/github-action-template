# The output schema

The `greeting` output is a plain string. The `result` output is **JSON with a published contract**: a downstream job, a bot, or an LLM reading workflow output can parse it and validate it, which makes it a public API rather than an implementation detail. This chapter is the template's live example of publishing one.

## The pieces

| Path | Role |
| --- | --- |
| `src/schema/result.ts` | `RunResultIdentity` (a `HostedSchema`: where the document lives and which version is current), `RunResult` (the one `Schema.Class` — the codec `setJson` encodes through AND the source the document is generated from) and `toRunResult` (the pure projection from the internal model). |
| `src/schema/outputs.ts` | `emitOutputs` passes `RunResult` to `ActionOutputs.setJson`, which takes the schema as its **encoder**. |
| `schemastore.config.ts` | The `defineConfig` value the `schemastore` command reads: one entry, keyed by `RunResultIdentity.name`, `hosted: RunResultIdentity`, `published: false`. |
| `schemas/<version>/github-action-template-<version>.json` | The committed document. Generated; never hand-edited. |

## One identity, one schema

`RunResultIdentity` is declared once, beside the schema it names, and read twice: every payload asserts its `$id` as `$schema` (a `Schema.Literal`, so a payload can only ever name the document that validates it), and `schemastore.config.ts` hands the same value to `defineConfig` as `hosted`. The committed document's `$id`, its write path (`schemas/<version>/<name>-<version>.json`) and the URL every payload carries all derive from that one value — nothing is spelled by hand, so there is nothing to keep in sync and no test pinning two URLs equal.

`RunResult` is likewise one schema used twice: `setJson`'s encoder and the config entry's `schema`. Two schemas describing "the same" output drift independently; one used for both never can. What absorbs internal churn is `toRunResult`, a plain total function from the action's internal `OutputsModel` to the published shape — so a model change is a compile error at that one call site rather than a silently changed contract downstream.

`@effected/schemastore` is therefore a runtime `dependency` (the action reads the identity from it) while `@effected/schemastore-cli`, which carries the ajv engine, stays a `devDependency`. The bundle-truth integration test (`__test__/integration/bundle.int.test.ts`) asserts no engine reaches `dist/`.

## The commands

```sh
pnpm schema:build   # schemastore build — regenerate schemas/ and commit the result
pnpm schema:check   # schemastore check — the drift gate, no writes (CI runs it)
```

Both are the `schemastore` bin from [`@effected/schemastore-cli`](https://github.com/spencerbeggs/effected/tree/main/packages/schemastore-cli), which finds `schemastore.config.ts` by walking upward from the working directory. Everything between "an Effect Schema" and "a committed file" belongs to the kit: [`@effected/schemastore`](https://github.com/spencerbeggs/effected/tree/main/packages/schemastore)'s pipeline generates, lints, validates under ajv strict mode, classifies the change against the file on disk, and writes only when the parsed content moved. This repository writes the identity and the config and nothing else — no generator script, no hand-rolled Draft-07 lowering, no drift-policy code, no drift test. `pnpm build` runs `schema:build` first (a turbo dependency of `build:prod`), and the `Test` workflow's schema-freshness job runs `pnpm schema:check`, which exits `1` whenever a build would write anything. The `Local Test` workflow additionally validates the action's real `result` payloads against the committed document they name.

## `published`: the lifecycle switch

The entry ships `published: false`. An unpublished schema **regenerates in place** through any change, contract included — right for a template, and right for a freshly bootstrapped copy, whose identity no consumer has fetched yet. While it is unpublished, change `RunResult` freely: `pnpm schema:build` rewrites `schemas/1.0.0/…` and you commit it.

**Flip it at the first real release** — the day a consumer can pin the document:

1. Set `published: true` on the entry in `schemastore.config.ts` and commit.

From then on a published label never changes its contract in place. Under the default `semantic` drift policy, a contract change (anything a validator asserts, including `default`, `examples`, `readOnly`, `writeOnly`) makes `build` and `check` exit `1` and write nothing, printing `DRIFT contract at published 1.0.0 → suggest 1.1.0`. An annotation-only change (a `description` edit) still rewrites the file in place. The response to drift is a version bump, never `--force`:

1. Append the suggested label to `RunResultIdentity`'s `versions` in `src/schema/result.ts` — `versions: ["1.0.0", "1.1.0"]`. The newest label is current; the previous one becomes a **frozen** file the command verifies on every run (it exists and declares its derived `$id`) and never regenerates.
2. Run `pnpm schema:build` and commit the new document beside the old one. Payloads now carry the new `$id` automatically.

## When the check goes red

- **`would write (annotations|contract)`** — the committed document is stale. If the schema changed on purpose, run `pnpm schema:build` and commit. If it changed by accident — a field renamed in a refactor, a type widened — revert it.
- **`DRIFT contract at published …`** — the contract moved on a published label. Bump the version as above.
- **A gate failure** (a lint warning or an ajv strict-mode finding) — the document would be broken for the editors it serves. `--force` does not override it; fix the schema.

Never hand-edit the committed document to make the check pass. That is the one action that makes the committed file stop describing what the action emits, which is exactly the failure the check exists to catch. Comparison is by parsed content, so a formatter reflowing the committed JSON is not drift.

## Annotations: where prose goes

**Field prose** goes in each field's `description`, annotated at the **definition site** (a usage-site annotation on a hoisted schema reaches nothing).

**The document's own `title` and `description`** go on the inner `Schema.Struct` handed to `Schema.Class`, not on the class. Core hoists a class into a `$defs` entry built from its encoded form — which is that struct — so annotations on the struct travel into the document, while annotations passed as `Schema.Class`'s second argument do not. The committed document is therefore a root `$ref` to `#/$defs/RunResultEncoded`, and that definition carries the title and description (JSON Schema editors resolve the `$ref`). When a root annotation cannot be expressed on the schema at all, the config entry's `rootAnnotations` is the kit's escape hatch. The description ends with a documentation URL on its own line, SchemaStore's convention, which `DocumentLint` checks as `DescriptionWithoutUrl`.

**Machine-reader hints** that do not belong in `description` may use the declared `x-ai-*` family — `x-ai-hint` (a string) is the recommended key. The non-standard keys a document can carry are exactly the declared families (the vscode five, `x-taplo`, `x-tombi-`, `x-intellij-`, `x-ai-`). Any other custom key is never published: annotated on a schema node it is not emitted at all, and admitted through `rootAnnotations` or an `includeAnnotationKey` predicate it fails the build with `UndeclaredAnnotationKeyError`.

## Remove the structured output

An action that publishes only scalar outputs has no contract to version and should not carry this machinery. To remove it completely:

1. **`action.yml`** — delete the `result` output.
2. **`src/schema/result.ts`** — delete the file.
3. **`src/schema/outputs.ts`** — drop `"result"` from `OUTPUT_NAMES`, the `setJson` call from `emitOutputs`, and the `result.js` import.
4. **`schemas/`** and **`schemastore.config.ts`** — delete both.
5. **`package.json`** — remove `@effected/schemastore` from `dependencies`, `@effected/schemastore-cli` from `devDependencies`, and the `schema:build` / `schema:check` scripts. Run `pnpm install`.
6. **`turbo.json`** — delete the `schema:build` task and drop it from `build:prod`'s `dependsOn`.
7. **`.github/workflows/test.yml`** — delete the `schema-freshness` job.
8. **`.github/workflows/act-test.yml`** — delete the `result` assertions and the "Validate the result payloads" step.
9. **Tests** — delete `__test__/unit/schema/result.test.ts`; remove the `result` assertions from `schema/outputs.test.ts`, `program.test.ts` and `integration/bundle.int.test.ts` (including the committed-document read).
10. **Docs** — delete this chapter and its entries in `docs/README.md`, `docs/01-getting-started.md`, `README.md`, and the `schemastore.config.ts` / `schema:*` lines in `CLAUDE.md` and `src/CLAUDE.md`.

Then run `pnpm typecheck`, `pnpm test` and `pnpm build`: the output-mirror test and the dependency-honesty test fail loudly on anything missed.
