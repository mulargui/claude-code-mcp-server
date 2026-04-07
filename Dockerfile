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

CMD ["node", "dist/index.js"]
