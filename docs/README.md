# Documentation

- [Getting started](./01-getting-started.md) — what the template ships, how the skeleton is wired, and how to grow it into your action.
- [GitHub App authentication](./02-github-app-auth.md) — the complete optional module: a working `pre`/`post` token lifecycle, the `action.yml` block, and the exact add/remove recipe.
- [The output schema](./04-output-schema.md) — how the structured `result` output is published as a versioned, drift-tested JSON Schema document, and what to do when the drift test goes red.
- [Bundler notes](./03-bundler-notes.md) — the forensic record behind `action.config.ts`'s per-need options: when `ignore` and `nativeDynamicImports` are required and how the recorded cases were diagnosed.
