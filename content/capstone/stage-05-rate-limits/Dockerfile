# Two stages: compile TypeScript with dev dependencies, then ship only dist/ and production dependencies.
FROM node:22.14.0-alpine3.21 AS build
WORKDIR /app
COPY package.json ./
# Versions are pinned exactly in package.json. Commit a package-lock.json and switch to `npm ci` in a real project.
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.14.0-alpine3.21
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# The official image ships an unprivileged "node" user; never run the service as root.
USER node
EXPOSE 8080
# exec form: node is PID 1 and receives SIGTERM from `docker stop`, so in-flight streams can drain.
CMD ["node", "dist/server.js"]
