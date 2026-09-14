FROM node:20-alpine

WORKDIR /app

COPY gateway/index.mjs ./gateway/
COPY gateway/package.json ./gateway/

EXPOSE 3000

CMD ["node", "gateway/index.mjs"]
