# CMake's automatic prefix detection can decode UTF-8 cl output as the OEM code page.
# Probe the actual installed UI language explicitly as UTF-8; an English pack is not required.
# A mismatched Ninja prefix silently loses header dependencies and can retain stale ABI objects.
if(NOT MSVC)
  return()
endif()
if(CMAKE_CXX_COMPILER_LOADED)
  set(bridge_include_compiler "${CMAKE_CXX_COMPILER}")
  set(bridge_include_extension cpp)
else()
  set(bridge_include_compiler "${CMAKE_C_COMPILER}")
  set(bridge_include_extension c)
endif()
set(bridge_include_probe "${CMAKE_CURRENT_BINARY_DIR}/msvc-include-probe.${bridge_include_extension}")
file(WRITE "${bridge_include_probe}" "#include <stddef.h>\n")
execute_process(
  COMMAND "${bridge_include_compiler}" /nologo /showIncludes /Zs "${bridge_include_probe}"
  RESULT_VARIABLE bridge_include_result
  OUTPUT_VARIABLE bridge_include_output
  ERROR_VARIABLE bridge_include_error
  ENCODING UTF-8
)
if(NOT bridge_include_result EQUAL 0)
  message(FATAL_ERROR "Cannot probe MSVC header dependency output; initialize the compiler environment")
endif()
string(REGEX MATCH "(^|\n)([^\r\n]*: +)[A-Za-z]:[/\\\\]" bridge_include_match "${bridge_include_output}")
if(NOT bridge_include_match)
  message(FATAL_ERROR "Cannot detect the UTF-8 MSVC include prefix for Ninja")
endif()
set(CMAKE_CL_SHOWINCLUDES_PREFIX "${CMAKE_MATCH_2}")
# Invalidate old objects whose dependency entries were empty before this correction.
# Changing Ninja's parser prefix alone does not change the compiler command.
add_compile_definitions(BRIDGE_MSVC_UTF8_DEPENDENCIES=1)
string(FIND "${CMAKE_CL_SHOWINCLUDES_PREFIX}" "�" bridge_bad_encoding)
if(NOT bridge_bad_encoding EQUAL -1)
  message(FATAL_ERROR "MSVC include output is not UTF-8; use a UTF-8 compiler terminal")
endif()
