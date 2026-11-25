FROM node:22-alpine
WORKDIR /app/catalog-service
ENV NODE_ENV=production HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
COPY --from=shared observability.js /app/observability.js
USER node
EXPOSE 3000
CMD ["node", "server.js"]
