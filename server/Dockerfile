FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY server/ ./server/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @u-no/shared build || true
RUN pnpm --filter @u-no/server build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY server/package.json ./server/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/server/dist ./server/dist

EXPOSE 3001

CMD ["node", "server/dist/main"]
