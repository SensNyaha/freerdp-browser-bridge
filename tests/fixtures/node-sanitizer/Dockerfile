FROM ubuntu@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55 AS compiler
RUN apt-get -o APT::Update::Error-Mode=any update \
    && apt-get install --no-install-recommends -y \
       ca-certificates g++-12 gcc-12 make python3 pkg-config xz-utils binutils \
    && rm -rf /var/lib/apt/lists/*
FROM compiler AS node-build
COPY node-v24.21.0.tar.xz /input/node-v24.21.0.tar.xz
COPY build-node.sh link_probe.hpp link_probe_first.cpp link_probe_main.cpp /input/fixture/
RUN --mount=type=cache,id=bridge-node-asan-24.21.0-ordered-v1,target=/src \
    sh /input/fixture/build-node.sh /input/node-v24.21.0.tar.xz /src/node-v24.21.0 /opt/node-sanitizer
FROM compiler AS runtime
COPY --from=node-build /opt/node-sanitizer /opt/node-sanitizer
ENV PATH=/opt/node-sanitizer/bin:/usr/bin:/bin
WORKDIR /work
USER 1000:1000
CMD ["node", "--version"]
