FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
