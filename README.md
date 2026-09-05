# github-action-template

A working template for building GitHub Marketplace actions on the [@effected](https://github.com/spencerbeggs/effected) Effect v4 kit, bundled by [@savvy-web/github-action-builder](https://github.com/savvy-web/github-action-builder).

The shipped action is a small, fully-tested demo — it greets, appends a job summary panel, publishes typed outputs, and reports its duration from the `post` phase. Its point is the structure: schema-mirrored inputs and outputs, one module per step with a decided failure posture, a single rendering surface, cross-phase state that provably survives the runner boundary, committed bundles with a freshness gate, and a test suite that asserts on the log stream and on the repo's own structure.

## Quick start

Use this repository as a template, then:

```sh
pnpm install
pnpm test
pnpm build
```

Read [docs/01-getting-started.md](./docs/01-getting-started.md) for the skeleton tour and the growth path, [docs/02-github-app-auth.md](./docs/02-github-app-auth.md) when your action needs GitHub App credentials, and [docs/03-bundler-notes.md](./docs/03-bundler-notes.md) before touching the bundler options.

## Try it

```yaml
- uses: savvy-web/github-action-template@main
  id: greet
  with:
    name: world
    emphatic: "true"
- run: |
    echo "${{ steps.greet.outputs.greeting }}"
    echo '${{ steps.greet.outputs.result }}' | jq -r .summaryWritten
```

Once you have made this template your own, that `uses:` becomes your repository and your release tag.

Inputs: `name`, `emphatic`, `write-summary`, `dry-run`. Outputs: `greeting` (a scalar) and `result` (a structured JSON payload). All declared — with their defaults — in [action.yml](./action.yml), which the code mirrors under test.

The `result` payload is a published contract, not an ad-hoc blob: it is generated from an Effect Schema into a committed, versioned JSON Schema document under [schemas/](./schemas), and a drift test fails the build if the two ever disagree. See [docs/04-output-schema.md](./docs/04-output-schema.md).

## Development

Claude Code users get the [effected plugin](https://github.com/spencerbeggs/effected) enabled by default; its skills carry the kit's API depth and the action-building playbook. `CLAUDE.md`, `src/CLAUDE.md` and `__test__/CLAUDE.md` document this repo's own conventions.

## License

[MIT](./LICENSE)
