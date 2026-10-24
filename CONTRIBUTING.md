# Contributing

This page covers how to set up, what a change needs before it merges, and the few rules specific to this repo.

## Set up

Follow [Local setup](README.md#local-setup) in the README.
Then turn on the pre-commit hook once per clone.

```bash
git config core.hooksPath .githooks
```

The hook runs `scripts/private-names.ts` on the staged files.
It blocks a commit that contains any display name from `apps/web/.env.local`, so those names stay out of the public history.

## Make a change

1. Branch from `main`.
2. Land each fix or feature with the tests that prove it, in the same commit.
3. Keep a commit to one change.
   A refactor, a formatting pass and a feature go in separate commits.
4. Open a pull request and wait for CI to pass.

Commit subjects follow `type(scope): subject`, as the history does.
The types are `feat`, `fix`, `docs`, `build`, `test`, `refactor`, `style`, `perf`, `ci`, `chore` and `revert`.
The scope names the area, such as `optimise`, `web`, `api` or `story`.

## Before you push

```bash
pnpm check                      # name check, typecheck, lint, tests, build
pnpm coverage                   # coverage floors
cd apps/api
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen pytest -q --cov
```

CI runs the same commands, plus a dependency audit, a gitleaks scan and a Docker build.

## Where tests go

| Code | Tests |
|---|---|
| `packages/<name>/src` | `packages/<name>/test/*.test.ts` |
| `apps/web/src/**` | a `__tests__` folder next to the module, `*.test.ts` or `*.test.tsx` |
| `apps/api/twin_api` | `apps/api/tests/test_*.py` |
| `recording/*.ts` | `recording/*.test.ts`, for helpers that run outside the browser |

Web component tests start with `// @vitest-environment jsdom` and render through Testing Library.
Tests that need the field read `data/demo/field.json` or call `generateField()`, so they always see the same seeded data.

Coverage floors live in `vitest.config.ts` and in `apps/api/pyproject.toml`.
Raise a floor when coverage goes up for good, and never lower one to get a change through.

## Changing the model or the data

The web app, the tests and the API all read `data/demo/`.
After you change `packages/physics`, `packages/optimise` or `packages/simulate`, regenerate it and commit the result with the change.

```bash
pnpm gen
```

CI runs `pnpm gen` and fails if `field.json` or `daily.parquet` differ from what is committed, or if `tables.json` moves by more than float noise.
The API's `test_repair_matches_the_typescript_twin` replays the golden edit in `tables.json`, so a scheduler change on either side must land on both.

Every number in the model is a stated assumption.
Add a new one to [docs/assumptions.md](docs/assumptions.md), and keep [docs/honesty.md](docs/honesty.md) true.

## Dependencies

pnpm owns the TypeScript side through `pnpm-lock.yaml`, and uv owns the API through `apps/api/uv.lock`.
Install with `pnpm install --frozen-lockfile` and `uv sync --frozen`, and commit the lockfile with any dependency change.
Dependabot opens update PRs every week.
