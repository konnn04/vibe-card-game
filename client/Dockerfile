FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY client/ ./client/

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DISCORD_CLIENT_ID
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_DISCORD_CLIENT_ID=${NEXT_PUBLIC_DISCORD_CLIENT_ID}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @u-no/shared build || true
RUN pnpm --filter @u-no/game-engine build || true
RUN pnpm --filter @u-no/client build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY client/package.json ./client/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/client/.next ./client/.next
COPY --from=builder /app/client/public ./client/public
COPY --from=builder /app/client/next.config.ts ./client/

EXPOSE 3000

CMD ["pnpm", "--filter", "@u-no/client", "start"]
