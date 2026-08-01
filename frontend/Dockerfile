# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

# ── development (hot-reload via mounted volumes) ───────────────────────────────
FROM base AS development
COPY . .
# Polling required for inotify events on macOS/Windows Docker Desktop mounts
ENV WATCHPACK_POLLING=true
EXPOSE 3002
CMD ["npm", "run", "dev"]

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY . .
# NEXT_PUBLIC_* vars are inlined at build time — pass via --build-arg.
# An undeclared --build-arg is silently ignored, so every one must be ARG'd here.
ARG NEXT_PUBLIC_STRAPI_URL=http://localhost:1339
ENV NEXT_PUBLIC_STRAPI_URL=$NEXT_PUBLIC_STRAPI_URL
# Browser-facing base for /uploads media. In production this is the FRONTEND host, so
# media is same-origin with the site (see the promode-uploads Traefik router). Defaults
# to the Strapi origin, which is what local dev wants.
ARG NEXT_PUBLIC_MEDIA_BASE=http://localhost:1339
ENV NEXT_PUBLIC_MEDIA_BASE=$NEXT_PUBLIC_MEDIA_BASE
RUN npm run build

# ── production (Next.js standalone output) ────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public                   ./public
COPY --from=builder /app/.next/standalone         ./
COPY --from=builder /app/.next/static             ./.next/static

EXPOSE 3002
ENV PORT=3002
CMD ["node", "server.js"]
