FROM node:22-slim

RUN apt-get update && apt-get install -y chromium --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_PATH=/app_modules/node_modules

COPY scraper/package*.json /app_modules/
RUN cd /app_modules && npm ci

WORKDIR /workspace/scraper
ENTRYPOINT ["node", "--max-old-space-size=512", "scraper.js"]
