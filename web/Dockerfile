# syntax=docker/dockerfile:1

# ---------- Stage 1: build the SPA ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first so this layer stays cached while only the source changes.
COPY package.json package-lock.json ./
RUN npm ci

# The container always talks to the real backend through nginx — never to MSW.
# Both values are baked into the bundle at build time, because Vite inlines them.
ENV VITE_USE_MOCKS=false
ENV VITE_API_BASE_URL=/api/v1

COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src

# `npm run build` = tsc -b && vite build, so a type error fails the image build.
RUN npm run build

# `public/` is copied verbatim, so drop the MSW worker: this image never mocks.
RUN rm -f /app/dist/mockServiceWorker.js

# ---------- Stage 2: serve the static bundle ----------
FROM nginx:1.27-alpine AS runtime

# The nginx image substitutes ${API_UPSTREAM} in every /etc/nginx/templates/*.template
# on startup, so the upstream can be overridden without rebuilding:
#   docker run -e API_UPSTREAM=http://api.internal:8000 ...
ENV API_UPSTREAM=http://backend:8000
# Only substitute our own variable; nginx's $uri, $host, ... must survive untouched.
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$

COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
