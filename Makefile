# Shortcuts over the pnpm scripts. `make demo` is the quick start.

.PHONY: demo install data check api video

install:
	pnpm install --frozen-lockfile

data:
	pnpm gen

demo: install
	pnpm build
	pnpm start

check:
	pnpm check

api:
	cd apps/api && uv sync --frozen && uv run --frozen pytest -q --cov

video:
	pnpm video
