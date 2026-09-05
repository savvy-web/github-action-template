# The output schema

The `greeting` output is a plain string. The `result` output is **JSON with a published contract**: a downstream job, a bot, or an LLM reading workflow output can parse it and validate it, which makes it a public API rather than an implementation detail. This chapter is the template's live example of publishing one.

## The pieces

| Path | Role |
| --- | --- |
| `src/schema/result.ts` | The shared `fields` object, `RunResult` (the codec `setJson` encodes through) and `RunResultDocument` (the struct the document is generated from). Also the version label and the URL every payload stamps into its own `$schema` field. |
| `src/schema/outputs.ts` | `emitOutputs` passes `RunResult` to `ActionOutputs.setJson`, which takes the schema as its **encoder**. |
| `lib/scripts/generate-schema.ts` | The target manifest (`targets`) and layer (`AppLayer`), plus the pre-write contract gate. |
| `schemas/<version>/github-action-template-<version>.json` | The committed document. Generated; never hand-edited. |
| `__test__/unit/generate-schema.test.ts` | The drift guard, over the generator's own exported `targets`. |

## One schema, two consumers

`RunResult` is passed to `setJson` **and** to the `SchemaTarget`. Two schemas describing "the same" output drift independently; one schema used for both never can. What absorbs internal churn is `toRunResult`, a plain total function from the action's internal `OutputsModel` to the published shape — so a model change is a compile error at that one call site rather than a silently changed contract downstream.

## The commands

```sh
pnpm schema:generate   # regenerate schemas/ and commit the result
pnpm schema:check      # the drift guard on its own (also runs in `pnpm test`)
```

Everything between "an Effect Schema" and "a committed file" belongs to [`@effected/schemastore`](https://github.com/spencerbeggs/effected/tree/main/packages/schemastore): `SchemaPipeline.run` is the whole generate → lint → validate → gate → write sequence, and `SchemaValidator.layer` is a real ajv strict-mode engine the package ships. This repository writes the target manifest and the log wording, and nothing else — a hand-rolled Draft-07 lowering is how a repo ends up maintaining a JSON Schema engine it did not mean to write.

## Two rules that are not style

**Gate before writing.** The generator runs `SchemaPipeline.check(targets)` first and aborts on any target whose `change === "contract"`. Rewriting an already-published version's file in place would silently break every consumer pinned to its URL; failing *after* the write would report the problem accurately and still have caused it. The response to a contract change is to bump `RESULT_SCHEMA_VERSION` in `src/schema/result.ts` — the new label writes a new file and leaves the published one intact.

**The drift test imports the generator's own `targets` and `AppLayer`.** A test that rebuilt either would pass while the generator emitted something else, which is a drift test that cannot detect drift. It asserts **both** halves — `blocked` is false and `DocumentDiff.isClean(change)` — because a document the gate would never write also reports no pending write, so the clean-diff half alone would call a permanently ungeneratable schema up to date.

## When the drift test goes red

It means one of two things, and it cannot tell them apart — you can:

- **The schema changed on purpose.** Run `pnpm schema:generate` and commit. If the change was a contract change, bump `RESULT_SCHEMA_VERSION` first.
- **The schema changed by accident** — a field renamed in a refactor, a type widened. Revert it.

Never hand-edit the committed document to make the test pass. That is the one action that makes the committed file stop describing what the action emits, which is exactly the failure the test exists to catch.

## Field prose goes in `description`

The Draft-07 lowering copies a fixed keyword set plus the declared non-standard families (the vscode five, `x-taplo`, `x-tombi-`, `x-intellij-`). An invented `x-ai-*` hint is silently dropped, so field-level prose for a human or an LLM reader goes in `description`, annotated at the **definition site**.

One measured limit, probed against the installed `effect` beta and worked around here. Core's `Schema.toJsonSchemaDocument` hoists a `Schema.Class` into a `$defs` entry built from its **encoded** ast, and the class's own `title`/`description` do not travel there — passed to `Schema.Class` or applied with `.annotate(...)`, they reach neither the emitted root (which is nothing but `$ref: "#/$defs/<Name>Encoded"`) nor the definition. The identical annotation on a `Schema.Struct` survives, and `SchemaTarget` exposes no document or annotation override. So `RunResultDocument` is a `Schema.Struct` built from the same `fields` object the class is built from: one field list, no duplication, and a root that describes itself. Because the annotation now survives at all, `DocumentLint`'s `DescriptionWithoutUrl` advisory becomes reachable — which is why the description ends with a documentation URL on its own line, per SchemaStore's convention. Upstream: [effected#606](https://github.com/spencerbeggs/effected/issues/606); removal is tracked in [#94](https://github.com/savvy-web/github-action-template/issues/94). Re-verify on the next kit bump — when a class's annotations reach its encoded definition, `RunResultDocument` collapses back into `RunResult`, which is a contract change and needs a version bump.
