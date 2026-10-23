vcpkg_check_linkage(ONLY_DYNAMIC_LIBRARY)
vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO OpenPrinting/cups
    REF ef80eeaea51430a055948240eea3f28ef5354edf
    SHA512 50d628f1c54d7f3ff7aa5819f4c79a5ee2cd192857e1ebda80ffc70eb1e17a3bbadb89917eba863656426bd576545c97f4b22991e73a725c20b794b6a56e7b52
    PATCHES
        001-local-queues-without-dnssd.patch
        002-client-as-needed-link.patch
)

# libcups retains the legacy driver/PPD APIs consumed by pinned FreeRDP.
# Use the upstream client-only component, without installing a scheduler/service.
vcpkg_make_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    COPY_SOURCE
    OPTIONS
        --with-components=libcups
        --with-tls=openssl
        --disable-static
        --disable-dnssd
        --disable-pam
        --disable-dbus
        --disable-unit-tests
)
vcpkg_make_install(TARGETS libs install-headers install-libs)

file(INSTALL "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-rel/cups.pc"
    DESTINATION "${CURRENT_PACKAGES_DIR}/lib/pkgconfig")
if(NOT VCPKG_BUILD_TYPE)
    file(INSTALL "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-dbg/cups.pc"
        DESTINATION "${CURRENT_PACKAGES_DIR}/debug/lib/pkgconfig")
endif()
vcpkg_fixup_pkgconfig()
vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE" "${SOURCE_PATH}/NOTICE")
