# Server Dockerfile - Flixtris Multiplayer Server
# WebSocket server with optional Redis persistence

FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy server code
COPY index.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "index.js"]
