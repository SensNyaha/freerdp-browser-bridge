FROM debian@sha256:2c037a04925515fdd6ea85ea14a682d0e79931f5e9f5d07b6dbfc6ba12f9e858
# Test daemons only. Prevent package installation from starting services.
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d \
    && chmod 0755 /usr/sbin/policy-rc.d \
    && apt-get -o APT::Update::Error-Mode=any update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
         cups-daemon cups-client pcscd libpcsclite1 vsmartcard-vpcd python3 util-linux \
    && useradd --uid 1000 --user-group --create-home --shell /usr/sbin/nologin bridge-inventory \
    && mkdir -p /opt/bridge-inventory-lab \
    && dpkg-query -W -f='${Package} ${Version}\n' cups-daemon cups-client pcscd libpcsclite1 vsmartcard-vpcd \
         > /opt/bridge-inventory-lab/packages.txt \
    && rm -rf /var/lib/apt/lists/*
USER 1000:1000
ENV HOME=/home/bridge-inventory LANG=C.UTF-8
ENTRYPOINT ["python3"]
