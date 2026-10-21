FROM debian:12@sha256:2c037a04925515fdd6ea85ea14a682d0e79931f5e9f5d07b6dbfc6ba12f9e858
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    xrdp xorgxrdp openbox dbus-x11 openssl ca-certificates python3 python3-tk fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/sh bridge-lab \
    && useradd --create-home --shell /bin/sh bridge-lab-2 \
    && usermod --append --groups ssl-cert xrdp \
    && mkdir -p /run/xrdp /run/dbus && chown xrdp:xrdp /run/xrdp
COPY desktop.py /opt/bridge-lab/desktop.py
COPY --chown=bridge-lab:bridge-lab xsession /home/bridge-lab/.xsession
RUN sed -i 's/\r$//' /home/bridge-lab/.xsession && chmod 755 /home/bridge-lab/.xsession \
    && cp /home/bridge-lab/.xsession /home/bridge-lab-2/.xsession \
    && chown bridge-lab-2:bridge-lab-2 /home/bridge-lab-2/.xsession
CMD ["sleep", "infinity"]
