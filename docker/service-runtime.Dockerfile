# Runtime assembly consumes the separately verified native and Node artifacts.
# A fresh native builder/distro matrix remains a separate pipeline requirement.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS assemble
WORKDIR /out
COPY native-linux.tar.gz node-linux.tar.gz /tmp/
RUN mkdir native api \
    && tar -xf /tmp/native-linux.tar.gz --strip-components=3 -C native \
    && tar -xf /tmp/node-linux.tar.gz -C api \
    && rm /tmp/native-linux.tar.gz /tmp/node-linux.tar.gz \
    && test -f native/bin/rdp-worker.ipc.json \
    && test -f api/dist/main.js \
    && test ! -e api/src \
    && test ! -e api/node_modules/typescript \
    && test ! -e api/node_modules/eslint

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ENV NODE_ENV=production \
    BRIDGE_LISTEN_HOST=0.0.0.0 \
    BRIDGE_LISTEN_PORT=8080 \
    BRIDGE_WORKER_PATH=/opt/freerdp-bridge/native/bin/rdp-worker \
    BRIDGE_SESSION_RUNTIME_DIR=/run/freerdp-bridge
COPY --from=assemble /out /opt/freerdp-bridge
WORKDIR /opt/freerdp-bridge/api
USER node
EXPOSE 8080
# Protected routes remain denied until the hosting application supplies identity.
# A host may replace CMD with its own bootstrap using the packaged JS API.
CMD ["node", "dist/main.js"]

FROM runtime AS verification
COPY api-runtime-probe.mjs /opt/api-runtime-probe.mjs
CMD ["node", "/opt/api-runtime-probe.mjs"]
