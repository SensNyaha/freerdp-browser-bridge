# Local native foundation/sanitizer verifier; source.tar is a clean git archive,
# catch2.tar contains the prepared public Catch2 3.8.1 source, without build output.
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
RUN apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o APT::Update::Error-Mode=any update \
    && apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=20 install -y --no-install-recommends build-essential g++-12 cmake ninja-build git python3 clang-18 libclang-rt-18-dev \
    && rm -rf /var/lib/apt/lists/*
COPY source.tar /tmp/source.tar
COPY catch2.tar /tmp/catch2.tar
RUN mkdir /work /catch2-src && tar -xf /tmp/source.tar -C /work && tar -xf /tmp/catch2.tar -C /catch2-src && rm /tmp/source.tar /tmp/catch2.tar
WORKDIR /work
RUN cat /etc/os-release && g++-12 --version && clang++-18 --version && cat /proc/sys/vm/mmap_rnd_bits
