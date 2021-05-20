FROM node:12-alpine as app

ENV NODE_ENV=production

# install java jre
# from: https://github.com/seletskiy/firebase-emulator/blob/master/Dockerfile
RUN apk --no-cache add openjdk8-jre


ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
# optionally if you want to run npm global bin without specifying path
ENV PATH=$PATH:/home/node/.npm-global/bin 

RUN npm install -g firebase-tools

# dependency
# from: https://github.com/BretFisher/node-docker-good-defaults/blob/main/Dockerfile
WORKDIR /node_app
COPY --chown=node:node functions/package*.json ./
# https://docs.npmjs.com/cli/v7/commands/npm-install#omitting-dependency-types
RUN apk --no-cache --virtual .gyp add python3 \
    && chown -R node:node /node_app \
    # fix permision denied problem
    && npm config set cache /node_app/.npm \
    && npm ci --only=production \
    apk del .gyp

ENV PATH /node_app/node_modules/.bin:$PATH

# pre-download emulators
WORKDIR /node_app/app

# https://github.com/firebase/firebase-tools#deployment-and-local-emulation
RUN firebase setup:emulators:firestore

USER node
CMD ["firebase", "emulators:start"]