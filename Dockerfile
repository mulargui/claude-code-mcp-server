# Dockerfile — Multi-Stage Docker Build
#
# Stage 1: Installs deps, compiles TypeScript, runs tests, and imports
# the doctor data from the MySQL dump into SQLite.
# Stage 2: Copies only production artifacts for a lean runtime image.

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

COPY data/ data/
RUN npm test
RUN npm run import-data
RUN npm run verify-data

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/data/doctors.db data/

EXPOSE 3000

CMD ["node", "dist/index.js"]
