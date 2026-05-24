# ── Build stage ──────────────────────────────────────────────────────────────
# Use Debian-based Node images for Prisma on Railway. Prisma 5.x is much more
# reliable here than on recent Alpine variants, which can miss the expected
# libssl/OpenSSL runtime and fail during `prisma migrate deploy`.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (cached layer unless package.json changes)
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# dumb-init handles signals properly so Railway SIGTERM reaches Node
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

# Regenerate prisma client for the runner architecture
RUN npx prisma generate

# Railway injects PORT — expose it symbolically
EXPOSE 3000

# Drop root
USER node

ENTRYPOINT ["dumb-init", "--"]

# Migrate then start — migrate is idempotent so safe on every deploy
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
