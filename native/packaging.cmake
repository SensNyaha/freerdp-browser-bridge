# All generators consume the same private, relocatable native runtime layout.
if(BRIDGE_WITH_FREERDP)
  if(NOT BRIDGE_DEPENDENCY_PREFIX OR NOT BRIDGE_FREERDP_PREFIX)
    message(FATAL_ERROR "Bundled build requires BRIDGE_DEPENDENCY_PREFIX and BRIDGE_FREERDP_PREFIX")
  endif()
  if(WIN32)
    install(DIRECTORY "${BRIDGE_DEPENDENCY_PREFIX}/bin/" "${BRIDGE_FREERDP_PREFIX}/bin/"
      DESTINATION bin FILES_MATCHING PATTERN "*.dll")
    set(CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS_SKIP TRUE)
    include(InstallRequiredSystemLibraries)
    if(CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS)
      install(PROGRAMS ${CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS} DESTINATION bin)
    endif()
  else()
    set(CMAKE_INSTALL_RPATH "$ORIGIN/../lib;$ORIGIN")
    set(CMAKE_INSTALL_RPATH_USE_LINK_PATH FALSE)
    install(DIRECTORY "${BRIDGE_DEPENDENCY_PREFIX}/lib/" "${BRIDGE_FREERDP_PREFIX}/lib/"
      DESTINATION lib FILES_MATCHING PATTERN "*.so" PATTERN "*.so.*")
  endif()
  set(bridge_license_dependencies zlib openssl libusb libjpeg-turbo libspng openh264 opus)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    list(APPEND bridge_license_dependencies krb5 icu cups libfuse numactl eudev)
  endif()
  foreach(dependency IN LISTS bridge_license_dependencies)
    install(FILES "${BRIDGE_DEPENDENCY_PREFIX}/share/${dependency}/copyright"
      DESTINATION "share/freerdp-bridge/licenses/${dependency}")
    install(FILES "${BRIDGE_DEPENDENCY_PREFIX}/share/${dependency}/vcpkg.spdx.json"
      DESTINATION share/freerdp-bridge/sbom/vcpkg RENAME "${dependency}.spdx.json")
  endforeach()
  if(NOT EXISTS "${BRIDGE_FREERDP_LICENSE_FILE}" OR IS_DIRECTORY "${BRIDGE_FREERDP_LICENSE_FILE}")
    message(FATAL_ERROR "Bundled build requires the pinned FreeRDP source license input")
  endif()
  install(FILES "${BRIDGE_FREERDP_LICENSE_FILE}"
    DESTINATION share/freerdp-bridge/licenses/freerdp RENAME LICENSE)
  install(FILES "${BRIDGE_FREERDP_PREFIX}/share/freerdp-bridge/freerdp-overrides.json"
    DESTINATION share/freerdp-bridge)
  install(FILES "${CMAKE_SOURCE_DIR}/native/freerdp-dsp-override.cmake"
    DESTINATION share/freerdp-bridge/overrides)
  install(FILES "${CMAKE_SOURCE_DIR}/native/dependencies.json" "${CMAKE_SOURCE_DIR}/native/vcpkg/vcpkg.json"
    DESTINATION share/freerdp-bridge)
  install(DIRECTORY "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/openh264" "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/opus" "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/libusb"
    DESTINATION share/freerdp-bridge/ports)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    install(DIRECTORY "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/cups" "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/eudev"
      "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/libfuse" "${CMAKE_SOURCE_DIR}/native/vcpkg/ports/numactl"
      DESTINATION share/freerdp-bridge/ports)
  endif()
  if(NOT EXISTS "${CMAKE_SOURCE_DIR}/build/native-features.json")
    message(FATAL_ERROR "Bundled build requires the generated native feature report")
  endif()
  # This declared metadata input also exists in source-only builds without an SDK cache copy.
  install(FILES "${CMAKE_SOURCE_DIR}/build/native-features.json" DESTINATION share/freerdp-bridge)
endif()
set(CPACK_PACKAGE_NAME "freerdp-bridge-native")
set(CPACK_PACKAGE_VENDOR "FreeRDP Node Bridge contributors")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Private native lifecycle runtime for FreeRDP Node Bridge")
set(CPACK_PACKAGE_INSTALL_DIRECTORY "FreeRDP Node Bridge")
set(CPACK_WIX_UPGRADE_GUID "56C026EC-73BE-43BC-B646-A51C82F198DA")
set(CPACK_DEBIAN_PACKAGE_MAINTAINER "FreeRDP Node Bridge contributors")
set(CPACK_DEBIAN_PACKAGE_SECTION "net")
set(CPACK_RPM_PACKAGE_LICENSE "Apache-2.0 AND Zlib AND LGPL-2.1-or-later")
if(WIN32)
  set(CPACK_GENERATOR ZIP)
else()
  set(CPACK_GENERATOR TGZ)
  set(CPACK_PACKAGING_INSTALL_PREFIX "/opt/freerdp-bridge")
endif()
include(CPack)
