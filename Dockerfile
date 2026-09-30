FROM node:22-alpine

# sql.js est en WASM : pas de compilation native nécessaire.
# tini assure la transmission correcte des signaux (SIGTERM) vers node.
RUN apk add --no-cache tini

WORKDIR /app

# On copie d'abord les manifestes pour réutiliser le cache Docker
COPY package*.json ./

# discord.js 14.27+ exige Node >= 18 ; les deps sont pures JS/WASM
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY . .

# La base SQLite doit être dans un volume, sinon elle est perdue à chaque
# recréation de conteneur.
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    TZ=Europe/Paris \
    DB_PATH=/app/data/giftblox.db \
    API_PORT=3001 \
    PORT=3001

EXPOSE 3001

# tini = PID 1 pour un arrêt propre quand `docker compose down`
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "main.js"]