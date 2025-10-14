## Stage 1 (base)
# This stage installs all dependencies and builds the application if needed
FROM node:22-alpine AS base

ARG PANDOC_VERSION=3.6.1
ARG TARGETPLATFORM

EXPOSE 8080

ENV NODE_ENV=production
ENV NODE_PATH=/usr/src/app/app
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1

# Set the working directory in the Docker container
WORKDIR /usr/src/app

# Install necessary packages for Puppeteer, the git client, and HEIF-enabled libvips
RUN apk add --no-cache --update \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing \
    git \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    vips-dev \
    vips-heif \
    libheif \
    libde265 \
    libjpeg-turbo \
    libpng \
    libwebp \
    build-base \
    python3 \
    pkgconfig

# Set the Puppeteer executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install Pandoc
RUN ARCH=$(echo ${TARGETPLATFORM} | sed -nE 's/^linux\/(amd64|arm64)$/\1/p') \
  && if [ -z "$ARCH" ]; then echo "Unsupported architecture: $TARGETPLATFORM" && exit 1; fi \
  && curl -L https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${ARCH}.tar.gz | tar xvz \
  && mv pandoc-${PANDOC_VERSION}/bin/pandoc /usr/local/bin/pandoc \
  && chmod +x /usr/local/bin/pandoc \
  && rm -r pandoc-${PANDOC_VERSION}

# Copy package file and any install hooks required during npm install
COPY package.json ./
COPY ./scripts/install/rebuild-sharp.js ./scripts/install/rebuild-sharp.js

RUN npm install --maxsockets 1 && \
    npm cache clean --force

## Stage 2 (development)
# This stage is for development and testing purposes
# It doesn't include the source code, so it's faster to build
# but you need to use docker bind mounts to get the source code in
# at runtime. 
FROM base AS dev

ENV NODE_ENV=development
ENV PATH=/usr/src/app/node_modules/.bin:$PATH

RUN npm install

# Configure git so the git client doesn't complain
RUN git config --global --add safe.directory /usr/src/app && git config --global user.email "you@example.com" && git config --global user.name "Your Name"

## Stage 3 (copy in source)
# This gets our source code into builder for use in next two stages
# It gets its own stage so we don't have to copy twice
# this stage starts from the first one and skips the last two
FROM base AS source

WORKDIR /usr/src/app

# Copy files and set ownership for non-root user
COPY ./config ./config
COPY ./app ./app
COPY ./TODO ./TODO

## Stage 4 (default, production)
# The final production stage
FROM source AS prod

HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --start-interval=5s --retries=3 \
  CMD curl --fail http://localhost:8080/health || exit 1

# Ensure the data directory exists
# In production we mount the shared data directory to this location
RUN mkdir -p /usr/src/app/data

# Give the non-root user ownership of the app directory and data directory
RUN chown -R 1000:1000 /usr/src/app/app && chown -R 1000:1000 /usr/src/app/data

# Change to the non-root user for the rest of the Dockerfile (ec2-user)
USER 1000

# Re-configuring git for the non-root user
RUN git config --global user.email "you@example.com" && git config --global user.name "Your Name"

# Build the documentation
RUN node app/documentation/build

CMD ["node", "/usr/src/app/app/index.js"]