FROM ubuntu@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55 AS compiler
RUN apt-get -o APT::Update::Error-Mode=any update \
    && apt-get install --no-install-recommends -y \
       ca-certificates g++-12 gcc-12 make python3 pkg-config xz-utils binutils \
    && rm -rf /var/lib/apt/lists/*
FROM compiler AS node-build
COPY node-v24.21.0.tar.xz /input/node-v24.21.0.tar.xz
RUN echo 'a6f54defb6fd7c84f41dba13d61e78e9b4e0961712cf61f29715c05f5ced94fc  /input/node-v24.21.0.tar.xz' | sha256sum --check \
    && mkdir /src \
    && tar -xJf /input/node-v24.21.0.tar.xz -C /src \
    && cd /src/node-v24.21.0 \
    && CC=gcc-12 CXX=g++-12 ./configure --enable-asan --prefix=/opt/node-sanitizer \
    && make -j2 \
    && make install
FROM compiler AS runtime
COPY --from=node-build /opt/node-sanitizer /opt/node-sanitizer
ENV PATH=/opt/node-sanitizer/bin:/usr/bin:/bin
WORKDIR /work
USER 1000:1000
CMD ["node", "--version"]
