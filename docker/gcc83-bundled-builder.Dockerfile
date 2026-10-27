FROM gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61
COPY ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
# Buster is archived; keep signed package verification and HTTPS enabled.
RUN printf '%s\n' 'deb https://archive.debian.org/debian buster main' > /etc/apt/sources.list \
    && rm -f /etc/apt/sources.list.d/* \
    && apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y --no-install-recommends curl zip unzip tar nasm bison autoconf-archive libltdl-dev pkg-config python3 \
    && rm -rf /var/lib/apt/lists/*
COPY node.tar.xz cmake.whl ninja.whl /tmp/tools/
RUN echo 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6  /tmp/tools/node.tar.xz' | sha256sum --check \
    && echo '1c8b05df0602365da91ee6a3336fe57525b137706c4ab5675498f662ae1dbcec  /tmp/tools/cmake.whl' | sha256sum --check \
    && echo '096487995473320de7f65d622c3f1d16c3ad174797602218ca8c967f51ec38a0  /tmp/tools/ninja.whl' | sha256sum --check \
    && mkdir -p /opt/bridge-tools/node /opt/bridge-tools/python \
    && tar -xf /tmp/tools/node.tar.xz --strip-components=1 -C /opt/bridge-tools/node \
    && python3 -m zipfile -e /tmp/tools/cmake.whl /opt/bridge-tools/python \
    && python3 -m zipfile -e /tmp/tools/ninja.whl /opt/bridge-tools/python \
    && chmod +x /opt/bridge-tools/python/cmake/data/bin/* /opt/bridge-tools/python/ninja-1.11.1.4.data/scripts/ninja \
    && rm -rf /tmp/tools
ENV PATH=/opt/bridge-tools/node/bin:/opt/bridge-tools/python/cmake/data/bin:/opt/bridge-tools/python/ninja-1.11.1.4.data/scripts:/usr/local/bin:/usr/bin:/bin \
    NODE_USE_SYSTEM_CA=1
RUN test "$(g++ -dumpfullversion)" = 8.3.0 \
    && test "$(node --version)" = v24.21.0 \
    && npm install --global pnpm@10.11.0 --ignore-scripts --no-audit --no-fund \
    && test "$(pnpm --version)" = 10.11.0 \
    && cmake --version && ninja --version
WORKDIR /work
