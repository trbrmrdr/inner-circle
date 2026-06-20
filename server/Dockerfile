FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY dist ./dist

RUN mkdir -p /app/private /app/tmp/media /app/tmp/autopost /app/tmp/work /app/tmp/logs /app/scripts/media

EXPOSE 4100
CMD ["node", "dist/server.js"]
