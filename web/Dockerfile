# Build the static site, then serve it with nginx (which also proxies /api to the backend).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# In Docker the site reads the backend through nginx; use --build-arg VITE_DATA_SOURCE=mock for the demo data.
ARG VITE_DATA_SOURCE=api
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY api_proxy.conf /etc/nginx/api_proxy.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
