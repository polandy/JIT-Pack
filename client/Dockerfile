# Build stage — compile the Vue/Ionic SPA to static assets.
# Base images are pinned by digest (supply-chain hardening); the tag is
# kept for readability. Dependabot (docker ecosystem) updates the digest.
#
# The major must match mise.toml's `node` and ci.yml's `node-version`: this
# stage builds the bundle that ships, and a version nothing else in the repo
# tests with would ship untested. scripts/toolchain-pins-gate.sh enforces that
# — moving the major is one change in all three files.
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage — nginx serves the SPA and proxies the API (see nginx.conf).
FROM nginx:1.31-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
