FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node /app/node_modules/.mf \
    && chown node:node /app
COPY --chown=node:node packages packages
COPY --chown=node:node gateway gateway
COPY --chown=node:node scripts/setup.ts scripts/dev-token.ts scripts/
COPY --chown=node:node infra/compose/ infra/compose/
COPY --from=auth --chown=node:node /app/services/auth services/auth
COPY --from=catalog --chown=node:node /app/services/catalog services/catalog
COPY --from=order --chown=node:node /app/services/order services/order
COPY --from=payment --chown=node:node /app/services/payment services/payment
ENV WRANGLER_SEND_METRICS=false
USER node
CMD ["sh", "infra/compose/start-gateway.sh"]
