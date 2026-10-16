# Independent native artifact runtime check for the first-class Ubuntu baseline.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS node-binary
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
# Remove only the two known fallback files inside this disposable verifier.
RUN rm /usr/lib/x86_64-linux-gnu/libudev.so.1 /usr/lib/x86_64-linux-gnu/libudev.so.1.7.8
# Node is the probe runner; native libraries come solely from the tested archive.
COPY --from=node-binary /usr/local/bin/node /usr/local/bin/node
WORKDIR /opt/freerdp-bridge
COPY native-linux.tar.gz /tmp/native-linux.tar.gz
RUN tar -xf /tmp/native-linux.tar.gz --strip-components=3 -C /opt/freerdp-bridge \
    && rm /tmp/native-linux.tar.gz \
    && test ! -e /work \
    && test ! -e /usr/lib/x86_64-linux-gnu/libudev.so.1 \
    && test ! -e /usr/lib/x86_64-linux-gnu/libfreerdp3.so.3
COPY native-clean-probe.mjs /opt/native-clean-probe.mjs
USER 1000:1000
CMD ["node", "/opt/native-clean-probe.mjs", "/opt/freerdp-bridge"]
