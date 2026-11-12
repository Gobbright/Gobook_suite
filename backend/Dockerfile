FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=5002 \
    FRONTEND_URL=https://gobooksuite.com \
    CLIENT_URL=https://gobooksuite.com \
    ALLOWED_ORIGINS=https://gobooksuite.com,https://www.gobooksuite.com \
    META_PUBLIC_ORIGIN=https://api.gobooksuite.com
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5002)+'/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "scripts/startProduction.js"] 
