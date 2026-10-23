# Host tools used by the bundled build also avoid automatic Visual Studio shell hooks.
set(VCPKG_TARGET_ARCHITECTURE x64)
set(VCPKG_CRT_LINKAGE dynamic)
set(VCPKG_LIBRARY_LINKAGE dynamic)
include("${CMAKE_CURRENT_LIST_DIR}/bridge-msvc-env.cmake")
