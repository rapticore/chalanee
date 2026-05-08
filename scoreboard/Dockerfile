FROM node:20.11-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3001
CMD ["node", "server.js"]
