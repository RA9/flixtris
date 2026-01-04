# Flixtris Multiplayer Server for Railway
FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package.json server/package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY server/index.js ./

# Railway sets PORT automatically
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "index.js"]
