FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
# Entfernt die problematische Workspace-Datei
RUN rm -f pnpm-workspace.yaml
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
