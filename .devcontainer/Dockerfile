FROM node:22-bookworm

# Install Claude Code into an npm prefix the non-root user owns.
# (Installing globally as 'node' into /usr/local fails with EACCES — this avoids it.)
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin

RUN mkdir -p /home/node/.claude /home/node/.npm-global /workspace \
    && chown -R node:node /home/node /workspace

USER node
WORKDIR /workspace

RUN npm install -g @anthropic-ai/claude-code
RUN npm install -g @colbymchenry/codegraph