FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY scripts/ ./scripts/
COPY server/ ./server/
COPY client/package.json ./client/
COPY gateway/package.json ./gateway/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @u-no/game-engine build
RUN pnpm --filter @u-no/shared build
RUN pnpm --filter @u-no/server build

RUN pnpm --filter @u-no/server --prod deploy /app/deploy

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SERVER_PORT=3001

COPY --from=builder /app/deploy ./

EXPOSE 3001

CMD ["node", "dist/main"]
