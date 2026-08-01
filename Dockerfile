FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Erlaubt die notwendigen Build-Skripte
RUN echo "onlyBuiltDependencies[]=sharp" > .npmrc && \
    echo "onlyBuiltDependencies[]=msw" >> .npmrc

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]