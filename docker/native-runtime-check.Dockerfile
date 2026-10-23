# Verification image only: the complete bridge/API service image is separate.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
# Remove the two known libudev fallback files only in this disposable verifier.
# The pinned base includes libudev via apt; it must not satisfy the tested bundle.
RUN rm /lib/x86_64-linux-gnu/libudev.so.1 /lib/x86_64-linux-gnu/libudev.so.1.7.5
WORKDIR /opt/freerdp-bridge
COPY native-linux.tar.gz /tmp/native-linux.tar.gz
RUN tar -xf /tmp/native-linux.tar.gz --strip-components=3 -C /opt/freerdp-bridge \
    && rm /tmp/native-linux.tar.gz \
    && test ! -e /work \
    && test ! -e /lib/x86_64-linux-gnu/libudev.so.1 \
    && test ! -e /usr/lib/x86_64-linux-gnu/libfreerdp3.so.3
COPY native-clean-probe.mjs /opt/native-clean-probe.mjs
USER node
CMD ["node", "/opt/native-clean-probe.mjs", "/opt/freerdp-bridge"]
