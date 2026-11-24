# syntax=docker/dockerfile:1

# ---------- deps: full dependency tree, including CLI/dev tools ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Placeholder only so Prisma can read the datasource block during generation.
# The real URL is supplied at runtime by Compose.
ENV DATABASE_URL="postgresql://postgres:root@localhost:5432/modubex?schema=public"

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npm run db:generate

# ---------- build: produces .next/standalone ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# NEXT_PUBLIC_* values are inlined during `next build`, so set them before it runs.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ---------- runner: lean standalone server, no Prisma CLI ----------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/.data/uploads \
  && chown -R nextjs:nodejs /app

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# File tracing can miss generated Prisma artifacts. Copy only the generated
# client and its runtime library; the Prisma CLI stays in the build stage.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs

EXPOSE 3000

# /api/health is the application health endpoint used by this reference stack.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "server.js"]
