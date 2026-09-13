# syntax=docker/dockerfile:1

###############################################################################
# Ú Nồ — image chạy trên host riêng.
#
# Ba chặng: cài gói -> build -> chạy. Chặng cuối KHÔNG mang theo node_modules
# lẫn mã nguồn, nhờ `output: 'standalone'` trong next.config.ts.
#
# ĐIỀU QUAN TRỌNG NHẤT KHI SỬA FILE NÀY: mọi biến `NEXT_PUBLIC_*` được NHÚNG
# THẲNG VÀO GÓI JAVASCRIPT LÚC BUILD. Khai chúng ở phần `environment:` của
# docker compose là VÔ TÁC DỤNG — lúc đó đã build xong lâu rồi, trình duyệt sẽ
# nhận chuỗi rỗng và phần chơi online im lặng không hoạt động. Chúng phải đi
# vào bằng `build.args` (xem docker-compose.yml).
###############################################################################

ARG NODE_VERSION=20-alpine

# ─────────────────────────────────────────────────────────── 1. Thư viện
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/game-engine/package.json ./packages/game-engine/
# --frozen-lockfile: build phải dựng lại đúng bộ thư viện của commit này,
# không được tự nâng cấp gì.
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────── 2. Build
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/game-engine/node_modules ./packages/game-engine/node_modules
COPY . .

# Biến công khai: phải có mặt TỪ LÚC NÀY, xem chú thích đầu file.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DISCORD_CLIENT_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DISCORD_CLIENT_ID=$NEXT_PUBLIC_DISCORD_CLIENT_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Đóng dấu phiên bản: .git không được copy vào image (xem .dockerignore) nên
# scripts/gen-version.mjs không hỏi git được. Truyền tay để dòng phiên bản
# trong Cài đặt vẫn chỉ đúng commit đang chạy.
ARG GIT_SHA=""
ARG GIT_COUNT=""
ENV RUSH_GIT_SHA=$GIT_SHA RUSH_GIT_COUNT=$GIT_COUNT

ENV NEXT_TELEMETRY_DISABLED=1
# prebuild tự quét lại public/sfx + public/music-theme và sinh manifest.
RUN pnpm build

# ─────────────────────────────────────────────────────────── 3. Chạy
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

# Không chạy bằng root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# public/ nặng ~87MB (ảnh bài + âm thanh + nhạc) và standalone KHÔNG tự gói nó,
# phải copy tay — thiếu là vào game trắng trơn, không hình không tiếng.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
