FROM node:22-alpine
WORKDIR /app/notification-service
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
USER node
CMD ["node", "notification-service.js"]
