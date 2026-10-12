# Sharondale caretaker dashboard.
#
# Node 22 is required rather than 20: the server uses the built-in node:sqlite
# module, which is only available from 22.5 onwards. Pinning it here means the
# container and every host that builds from this file agree on that.
FROM node:22-alpine

WORKDIR /app

# There are no production dependencies to install: node:sqlite is built in and
# the server uses only the standard library. Copying the manifests first keeps
# the layer cache useful if dependencies are ever added.
COPY package.json ./

COPY server ./server
COPY dashboard ./dashboard

# The SQLite file lives here. Mount a persistent volume at this path on the
# host, otherwise the board resets on every deploy.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV SHARONDALE_DB=/app/data/sharondale.db

# Run as the unprivileged user that the node image already provides.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# The host uses this to decide whether the instance is healthy. It touches the
# database as well as the HTTP layer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
