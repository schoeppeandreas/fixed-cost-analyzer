FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Erlaubt die Build-Skripte von sharp und msw
RUN printf "only-built-dependencies[]=sharp\nonly-built-dependencies[]=msw\n" > .npmrc

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]