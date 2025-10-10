# syntax=docker/dockerfile:1
FROM node:20-alpine as build
WORKDIR /app

# install deps
COPY package*.json ./
RUN npm ci

# app source
COPY . .

# build TS -> JS
RUN npm run build

# --- runtime image
FROM node:20-alpine
WORKDIR /app

# only copy what we need to run
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3006
CMD ["node", "dist/index.js"]
# Note: remove dev stage. Final image is production runtime above.