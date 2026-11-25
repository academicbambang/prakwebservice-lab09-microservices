FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node /app/node_modules/.mf \
    && chown node:node /app
COPY --chown=node:node packages packages
COPY --chown=node:node services/catalog services/catalog
ENV WRANGLER_SEND_METRICS=false
USER node
CMD ["node_modules/.bin/wrangler", "dev", "-c", "services/catalog/wrangler.jsonc", "--local", "--ip", "0.0.0.0", "--port", "3002"]
