# Bundler notes: the per-need options and their forensic record

`action.config.ts` deliberately ships with **no** `ignore` and **no** `nativeDynamicImports` entries. Both exist for real failure modes, both are added per-need, and every entry you add should carry a comment like the ones below — what breaks without it, and how it was proved. These are the recorded cases from the migrated silk actions.

## `ignore` — optional plugins a dependency probes for

**When:** a dependency `require`s optional plugins you never invoke and do not install. `ignore` aliases the module to a throwing stub; the dependency's own try/catch falls through gracefully.

**Recorded case (silk-release-action):** `@cyclonedx/cyclonedx-library` (via `@effected/sbom`) ships optional XML serializers/validators and draft-2019 JSON validators behind an `_optPlug` optional-require pattern. Only the JSON serializer is used, the plugins are not installed and would never exist in the deployed action:

```ts
ignore: ["xmlbuilder2", "libxmljs2", "ajv-formats-draft2019"],
```

`ignore` is correct here, not `externals` — `externals` means "available at runtime", which they are not. **Only add this trio when `@effected/sbom` (or another cyclonedx consumer) is actually in your dependency graph**; as inert insurance it just teaches the next reader to cargo-cult.

## `nativeDynamicImports` — computed `import()` a package performs at runtime

**When:** a dependency resolves a module path at runtime and dynamic-imports it. Without the entry, rspack compiles that import into a context module and the deployed action throws `Cannot find module 'file:///…'` even though the file exists — **only in production, because vitest runs source, not the bundle**.

**Recorded case (silk-release-action, silk-update-action):** the changesets engine dynamic-imports the configured changelog module:

```ts
nativeDynamicImports: ["@changesets/apply-release-plan"],
```

**Known trap:** the option is implemented as a regex text transform with no lexical state. A package whose *JSDoc prose* contains the literal text `import()` gets the `/* webpackIgnore: true */` comment injected inside a doc comment, closing it early and spilling the rest into the token stream — the parse error lands on the next statement, not the cause. `@effected/workspaces` documents its own computed import three times in prose and therefore **cannot be listed here**; its "Critical dependency" warning is benign as long as the config-dependency-hooks path is unreachable in your action.

**First-party computed imports** (a path built at runtime from a temp directory) are out of this option's reach — it only matches `node_modules/<name>/` paths. Carry an inline `/* webpackIgnore: true */` magic comment at the call site instead, and guard it: silk-update-action's `lib/scripts` post-build assert proves the built `dist/main.js` still holds a genuine `await import(<ident>)` at that call site, so deleting the magic comment fails the build instead of the deployed action.

## Build-time data is a defect surface, not a runtime condition

If your action bakes data into the bundle (an offline version cache, a vendored dataset), **never** degrade its decode failure to an empty value: `Effect.orElseSucceed(() => [])` turned a broken silk-update-action bundle into a truthful-sounding "no versions found". A build-time decode failure is a programming error — let it die, loudly, naming the data.

Prefer bundle-safe standalone functions over post-class static aliases: a static attached to a class after its declaration (`SemVer.parse`-style) can tree-shake out of the full import graph and throw `X is not a function` only in the bundle.
