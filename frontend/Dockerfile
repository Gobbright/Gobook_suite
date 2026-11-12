FROM node:24-bookworm-slim AS build
WORKDIR /app

ARG VITE_API_URL=https://api.gobooksuite.com/api
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_LAUNCH_AT=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_LAUNCH_AT=$VITE_LAUNCH_AT

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
