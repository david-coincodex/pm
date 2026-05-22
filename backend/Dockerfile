# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

# ── development (hot-reload via mounted volumes) ───────────────────────────────
FROM base AS development
COPY . .
EXPOSE 1339
CMD ["npm", "run", "develop"]

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY . .
RUN npm run build

# ── production ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist            ./dist
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/package*.json   ./
COPY --from=builder /app/public          ./public
COPY --from=builder /app/favicon.png     ./favicon.png

EXPOSE 1339
CMD ["npm", "run", "start"]
