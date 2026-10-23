vcpkg_check_linkage(ONLY_DYNAMIC_LIBRARY)
vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO eudev-project/eudev
    REF 9e7c4e744b9e7813af9acee64b5e8549ea1fbaa3
    SHA512 343b29a8db9ce2e1d136fe3049f2ad492ebd96804eca149e0fadc88a2e92b7fa0dd57c1ce4cb13d9d184d76cee06bcaa69f064b0c90d0cf99a322941944a7678
)
vcpkg_add_to_path(PREPEND "${CURRENT_HOST_INSTALLED_DIR}/tools/gperf")
vcpkg_make_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    AUTORECONF
    OPTIONS
        --disable-static
        --disable-programs
        --disable-hwdb
        --disable-manpages
        --disable-rule-generator
        --disable-mtd_probe
        --disable-blkid
        --disable-kmod
        --disable-selinux
        --sysconfdir=/etc
        --with-rootlibexecdir=/usr/lib/udev
        --with-rootrundir=/run
)
# Only the client library is installed; the host keeps its existing udev daemon,
# rules and hardware database. The bridge does not replace system device services.
vcpkg_make_install()
vcpkg_fixup_pkgconfig()
vcpkg_install_copyright(FILE_LIST
    "${SOURCE_PATH}/COPYING"
    "${CURRENT_PORT_DIR}/LICENSE.LGPL-2.1"
)
