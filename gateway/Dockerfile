FROM node:22-alpine
WORKDIR /app/gateway
ENV NODE_ENV=production HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .
COPY --from=shared observability.js /app/observability.js
COPY --from=shared output/pdf/laporan-praktikum-sesi-09.pdf /app/output/pdf/laporan-praktikum-sesi-09.pdf
COPY --from=shared output/latex/laporan-praktikum-sesi-09-overleaf.zip /app/output/latex/laporan-praktikum-sesi-09-overleaf.zip
USER node
EXPOSE 8080
CMD ["node", "gateway.js"]
