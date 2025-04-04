FROM node:22.14-alpine3.21 AS builder
WORKDIR /app
RUN apk --no-cache --virtual build-dependencies add python3 make g++
COPY package*.json ./
ENV NODE_ENV=development
RUN npm ci --silent
ADD ./ ./
RUN npm run build


FROM node:22.14-alpine3.21
WORKDIR /app
# TODO: pem files should not be in the image
COPY package*.json *.pem run.sh .sequelizerc ./
ENV NODE_ENV=production
RUN npm ci --silent && npm cache clean --silent --force
COPY --from=builder /app/dist ./dist
CMD ["sh", "/app/run.sh"]
