# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

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
FROM node:20-alpine AS runner

# dumb-init handles signals properly so Railway SIGTERM reaches Node
RUN apk add --no-cache dumb-init

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
