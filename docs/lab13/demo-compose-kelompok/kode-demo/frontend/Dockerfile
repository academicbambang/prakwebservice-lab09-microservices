FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend frontend
COPY scripts/build-api-docs.mjs scripts/combine-openapi.mjs scripts/
COPY services services
COPY gateway gateway
ENV VITE_AUTH_URL=http://127.0.0.1:3000 VITE_GATEWAY_URL=http://127.0.0.1:3000 VITE_CATALOG_URL=http://127.0.0.1:3000/graphql
RUN npm run build:frontend && install -d -o node -g node /app/node_modules/.vite-temp
USER node
CMD ["npm", "run", "preview:frontend", "--", "--host", "0.0.0.0", "--port", "5173"]
