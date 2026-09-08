# Main API server (Express + pg + MQTT/WebSocket bridge)
FROM node:20-slim

WORKDIR /app

# Shared libraries required by Puppeteer's bundled Chromium (headless PDF).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates fonts-liberation \
     libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
     libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
     libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching.
# Puppeteer downloads its own matched Chromium during install.
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

EXPOSE 5000

CMD ["node", "index.js"]
