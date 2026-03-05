# Use the official Node.js 18 image as base
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat \
  && corepack enable
WORKDIR /app

# Install production dependencies with pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Install ALL dependencies (including dev dependencies) for build
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && pnpm install --frozen-lockfile

COPY . .

# Build the application
RUN pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

# Needed for admin migration import route (`psql` / `pg_restore`),
# document preview generation (`pdftoppm` + `soffice`),
# document/text preview rendering (`fontconfig` + actual fonts),
# and video preview frame extraction (`ffmpeg`).
RUN apk add --no-cache postgresql-client poppler-utils libreoffice fontconfig ttf-dejavu ffmpeg \
  && fc-cache -f

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

RUN corepack enable

# Copy the public folder
RUN mkdir -p /app/public && chown -R nextjs:nodejs /app/public
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/docker/entrypoint.sh /app/entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package.json
# Keep runtime deps minimal by taking prod-only installs from deps stage.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts /app/drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json /app/tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/src/db/schema.ts /app/src/db/schema.ts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start the application
CMD ["/app/entrypoint.sh"]
