# The caller initializes SDK/MSVC with scripts/msvc-env.cmd, without shell integration.
# Do not let vcpkg repeat vcvarsall, which also invokes Visual Studio's dynamic vcpkg hook.
set(VCPKG_LOAD_VCVARS_ENV OFF)
set(VCPKG_ENV_PASSTHROUGH
  PATH INCLUDE LIB LIBPATH
  VSINSTALLDIR VCINSTALLDIR VCToolsInstallDir VCToolsVersion
  WindowsSdkDir WindowsSDKVersion UniversalCRTSdkDir UCRTVersion)
list(APPEND VCPKG_HASH_ADDITIONAL_FILES "${CMAKE_CURRENT_LIST_FILE}")
