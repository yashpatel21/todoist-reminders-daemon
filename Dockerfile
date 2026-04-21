# Pin amd64 so images built on Apple Silicon run on typical Portainer/Proxmox (x86_64) hosts.
# For ARM-only servers, remove --platform or set to linux/arm64.
# Build: docker build --platform linux/amd64 -t youruser/todoist-reminders-daemon:latest .
FROM --platform=linux/amd64 node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Runtime: only production deps + compiled JS
FROM --platform=linux/amd64 node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prefer IPv4 when resolving hosts — broken IPv6 routes in Docker often hang outbound HTTPS indefinitely.
ENV NODE_OPTIONS=--dns-result-order=ipv4first

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
USER node

CMD ["node", "dist/index.js"]
