# GitHub App authentication (optional module)

The template's default path needs no credentials. When your action must call the GitHub API as an App installation — creating check runs, opening PRs, pushing commits — add the token lifecycle below. It is the complete, working shape the `silk-update-action` and `silk-release-action` run in production: **provision in `pre` with scope verification, consume through a layer in `main`, revoke unconditionally in `post`**.

## The add recipe

### 1. `action.yml` — add the entry and the two inputs

```yaml
inputs:
  app-client-id:
    description: GitHub App client ID for authentication
    required: true
  app-private-key:
    description: GitHub App private key (PEM format)
    required: true
runs:
  using: node24
  pre: dist/pre.js   # add this line
  main: dist/main.js
  post: dist/post.js
```

Also add `pre: "src/pre.ts"` to the `entries` in `action.config.ts`, and `@effected/github` to `dependencies` (`GitHubApp.layer` lives there).

### 2. `src/pre.ts` — provision, verify scopes, persist

```ts
import { GitHubApp } from "@effected/github";
import { Action, ActionEnvironment, ActionInput, GitHubToken } from "@effected/github-actions";
import { Effect } from "effect";

export const pre = Effect.gen(function* () {
 const env = yield* ActionEnvironment;
 const appId = yield* ActionInput.string("app-client-id");
 const privateKey = yield* ActionInput.redacted("app-private-key");
 const owner = (yield* env.github).repositoryOwner;

 // `required` is verified against what GitHub actually granted BEFORE the
 // token is persisted — a misconfigured installation fails here in `pre`,
 // not as a 403 mid-run in `main`. List exactly the scopes your action uses.
 const token = yield* GitHubToken.provision({
  appId,
  privateKey,
  owner,
  required: { contents: "write", pull_requests: "write", checks: "write" },
 });
 yield* Effect.logInfo(`Token generated (expires: ${token.expiresAt})`);
});

export const PreLive = GitHubApp.layer;

/* v8 ignore next 3 -- entry-point guard, only runs inside a GitHub Actions runner */
if (process.env.GITHUB_ACTIONS) {
 await Action.run(pre, { layer: PreLive });
}
```

`GitHubToken.provision` mints the installation token, masks it, and persists the envelope to `ActionState` under its own key — you never model it in `state.ts`.

### 3. `main` — consume through the client layer

Wherever your app layer composes `@effected/github` resource services, build the client from the persisted envelope:

```ts
import { GitHubToken } from "@effected/github-actions";
import { Layer } from "effect";

// Inside your layer composition (e.g. makeAppLayer):
const client = GitHubToken.clientLayer(); // reads the envelope pre persisted
```

No `process.env.GITHUB_TOKEN` bridge — the envelope crosses phases through `ActionState`.

### 4. `src/post.ts` — revoke unconditionally, under the double net

Add to the existing `post` program, before the nets:

```ts
import { GitHubToken } from "@effected/github-actions";

// Inside the Effect.gen body — dispose is a no-op if pre never provisioned:
yield* Effect.logInfo("Revoking GitHub App installation token...");
yield* GitHubToken.dispose().pipe(
 Effect.catch((e) => Effect.logWarning(`Token revocation failed: ${String(e)}`)),
);
```

`GitHubToken.dispose` needs `GitHubApp`, so post's entry becomes `Action.run(post, { layer: GitHubApp.layer })`. The installation token would expire after an hour anyway; revoking it anyway is the belt-and-braces contract — and it sits inside post's catch/catchDefect double net, so a revocation failure can never fail the workflow.

## The remove recipe (back to token-minimal)

Delete `src/pre.ts`; drop the `pre:` line from `action.yml` and `action.config.ts`; remove the two `app-*` inputs; replace `GitHubToken.clientLayer()` with a client built from a plain `github-token` input (or drop the API dependency entirely); remove the dispose block and the `GitHubApp.layer` option from `post.ts`; drop `@effected/github` if nothing else imports it (the dependency-honesty test will remind you).
