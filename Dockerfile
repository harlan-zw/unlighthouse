FROM oven/bun:1.4.2-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY src ./src

RUN mkdir /data && chown bun:bun /data

# Docker's default seccomp profile blocks the user namespaces Chrome's sandbox needs.
ENV CHROME_PATH=/usr/bin/chromium \
    UNLIGHTHOUSE_NO_SANDBOX=1 \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

USER bun
WORKDIR /data
VOLUME /data
EXPOSE 5678

ENTRYPOINT ["bun", "/app/src/cli.ts"]
CMD ["--help"]
