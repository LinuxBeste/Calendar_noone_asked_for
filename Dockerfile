FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build:web && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/web/dist ./web/dist
ENV CALENDAR_WEB_DIR=/app/web/dist
ENV CALENDAR_DATA_DIR=/data
ENV CALENDAR_API_HOST=0.0.0.0
ENV CALENDAR_API_PORT=3001
VOLUME /data
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
