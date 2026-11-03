# Partner API image. Build from the repo root, because partner-api reuses
# @ledgerline/core (seed data & payout methods):
#   docker build -f partner-api/Dockerfile -t ledgerline-partner-api .
FROM node:22-bookworm-slim

# Prisma's migration engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# npm ci reads every workspace's manifest from the lockfile, so copy them all,
# but only install what partner-api needs.
COPY package.json package-lock.json ./
COPY apps/console/package.json apps/console/
COPY modules/frontpage/package.json modules/frontpage/
COPY modules/ledger/package.json modules/ledger/
COPY modules/payouts/package.json modules/payouts/
COPY modules/risk/package.json modules/risk/
COPY modules/support/package.json modules/support/
COPY packages/core/package.json packages/core/
COPY partner-api/package.json partner-api/
RUN npm ci --workspace @ledgerline/partner-api --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/core/src packages/core/src
COPY partner-api partner-api
WORKDIR /app/partner-api
RUN npx prisma generate

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, seed (a no-op once seeded), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && exec npx tsx src/index.ts"]
