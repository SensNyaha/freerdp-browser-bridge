FROM gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61

# Prepared, hash-checked public tools and Catch2 sources only. No host SDK,
# node_modules, credentials or runtime directories enter the build context.
COPY tools /tools
COPY catch2 /catch2
ADD source.tar /work/
ENV PATH=/tools/cmake/data/bin:/tools/ninja-1.11.1.4.data/scripts:/usr/local/bin:/usr/bin:/bin
WORKDIR /work
RUN chmod +x /tools/cmake/data/bin/cmake /tools/cmake/data/bin/ctest \
        /tools/cmake/data/bin/cpack /tools/ninja-1.11.1.4.data/scripts/ninja \
    && test "$(g++ -dumpfullversion)" = 8.3.0 \
    && cmake -S . -B build/gcc83 -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++ \
        -DBUILD_TESTING=ON -DBRIDGE_WITH_FREERDP=OFF \
        -DFETCHCONTENT_SOURCE_DIR_CATCH2=/catch2 \
        -DFETCHCONTENT_FULLY_DISCONNECTED=ON \
    && cmake --build build/gcc83 --parallel 2
CMD ["ctest", "--test-dir", "/work/build/gcc83", "--output-on-failure", "--no-tests=error", "--timeout", "60"]
