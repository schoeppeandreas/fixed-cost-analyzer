FROM node:20-alpine

# pnpm aktivieren
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Zuerst nur die Lock- und Package-Dateien kopieren (besserer Cache)
COPY package.json pnpm-lock.yaml* ./

# Abhängigkeiten installieren
RUN pnpm install --frozen-lockfile

# Restlichen Code kopieren
COPY . .

# App bauen
RUN pnpm build

# Port freigeben
EXPOSE 3000

# App starten
CMD ["pnpm", "start"]