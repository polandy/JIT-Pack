# Build stage — compile the Vue/Ionic SPA to static assets.
# Base images are pinned by digest (supply-chain hardening); the tag is
# kept for readability. Dependabot (docker ecosystem) updates the digest.
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage — nginx serves the SPA and proxies the API (see nginx.conf).
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
