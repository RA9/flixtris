# Flixtris - Full Stack for Railway
FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package.json server/package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY server/index.js ./

# Copy frontend static files
COPY index.html ../public/
COPY about.html ../public/
COPY landing.html ../public/
COPY js/ ../public/js/
COPY css/ ../public/css/
COPY icons/ ../public/icons/
COPY manifest.json ../public/

# Railway sets PORT automatically
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "index.js"]
