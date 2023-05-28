FROM node:18-alpine as app

ENV NODE_ENV=production

# install java jre
# from: https://github.com/seletskiy/firebase-emulator/blob/master/Dockerfile
RUN apk --update --no-cache add openjdk11-jre

RUN npm install -g firebase-tools@12

# dependency
# from: https://github.com/BretFisher/node-docker-good-defaults/blob/main/Dockerfile
WORKDIR /node_app
COPY --chown=node:node ./package*.json ./
# https://docs.npmjs.com/cli/v7/commands/npm-install#omitting-dependency-types
RUN chown -R node:node /node_app \
    # fix permision denied problem
    && npm config set cache /node_app/.npm \
    && npm ci --only=production

ENV PATH /node_app/node_modules/.bin:$PATH

WORKDIR /node_app/app

# fix permision denied problem
RUN mkdir -p /home/node/.cache/firebase/emulators \ 
    && chown node:node /home/node/.cache/firebase/emulators

USER node
CMD ["firebase", "emulators:start", "--import=./emulator-data", "--export-on-exit"]