FROM node:22.16.0-bookworm-slim AS app
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.json ./
COPY infra/certs ./infra/certs
RUN pnpm install --frozen-lockfile
RUN pnpm build
ENV NODE_ENV=production
USER node
CMD ["node", "apps/web/build"]
