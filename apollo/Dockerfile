FROM node:14-alpine as app

ENV NODE_ENV=production

RUN npm install -g nodemon

# dependency
# from: https://github.com/BretFisher/node-docker-good-defaults/blob/main/Dockerfile
WORKDIR /node_app
COPY --chown=node:node ./package*.json ./
# https://docs.npmjs.com/cli/v7/commands/npm-install#omitting-dependency-types
RUN apk --no-cache --virtual .gyp add python3 \
    && chown -R node:node /node_app \
    # fix permision denied problem
    && npm config set cache /node_app/.npm \
    && npm ci --only=production \
    apk del .gyp

ENV PATH /node_app/node_modules/.bin:$PATH

WORKDIR /node_app/app

# for prodcution use
COPY --chown=node:node . .

EXPOSE 8080

USER node
CMD ["node", "index.js"]