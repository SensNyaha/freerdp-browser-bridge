FROM rockylinux@sha256:d7be1c094cc5845ee815d4632fe377514ee6ebcf8efaed6892889657e5ddaaa6
RUN dnf -y install rpm-build tar gzip xz && dnf clean all
WORKDIR /work
