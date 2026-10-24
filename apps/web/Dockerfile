# Build from the repository root: docker build -f apps/web/Dockerfile .
# Display names are build-time settings, so pass them as build args if needed.
FROM node:26-slim AS build
RUN npm install -g pnpm@10.26.2
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/
COPY packages/physics/package.json packages/physics/
COPY packages/optimise/package.json packages/optimise/
COPY packages/simulate/package.json packages/simulate/
RUN pnpm install --frozen-lockfile --filter "@bgw/web..."

COPY packages packages
COPY apps/web apps/web
COPY data/demo data/demo

ARG NEXT_PUBLIC_PRODUCT=""
ARG NEXT_PUBLIC_FIELD=""
ARG NEXT_PUBLIC_EVENT=""
ARG NEXT_PUBLIC_PS=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_PRODUCT=$NEXT_PUBLIC_PRODUCT \
    NEXT_PUBLIC_FIELD=$NEXT_PUBLIC_FIELD \
    NEXT_PUBLIC_EVENT=$NEXT_PUBLIC_EVENT \
    NEXT_PUBLIC_PS=$NEXT_PUBLIC_PS
RUN pnpm --filter @bgw/web build

FROM node:26-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/story').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
