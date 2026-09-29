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
	cd apps/api && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && .venv/bin/pytest -q

video:
	pnpm video
