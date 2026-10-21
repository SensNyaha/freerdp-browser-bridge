if(DEFINED BRIDGE_POLICY_COMPILER)
  include("${CMAKE_CURRENT_LIST_DIR}/compiler.cmake")
  bridge_require_supported_compiler("${BRIDGE_POLICY_COMPILER}" "${BRIDGE_POLICY_VERSION}")
  return()
endif()

foreach(policy_case IN ITEMS "GNU:7.5:reject" "GNU:8.2:reject" "GNU:8.3:accept" "GNU:8.3.0:accept" "GNU:8.5:accept" "GNU:10.5:accept" "GNU:11:accept" "GNU:11.4.1:accept" "GNU:12:accept" "GNU:12.2:accept" "GNU:13.3:accept" "Clang:18.1:accept" "MSVC:19.44:accept")
  string(REPLACE ":" ";" policy_fields "${policy_case}")
  list(GET policy_fields 0 compiler_id)
  list(GET policy_fields 1 compiler_version)
  list(GET policy_fields 2 expectation)
  execute_process(COMMAND "${CMAKE_COMMAND}"
    "-DBRIDGE_POLICY_COMPILER=${compiler_id}" "-DBRIDGE_POLICY_VERSION=${compiler_version}"
    -P "${CMAKE_CURRENT_LIST_FILE}"
    RESULT_VARIABLE result OUTPUT_VARIABLE output ERROR_VARIABLE diagnostic TIMEOUT 5)
  if(expectation STREQUAL "accept")
    if(NOT "${result}" STREQUAL "0")
      message(FATAL_ERROR "Supported compiler policy case failed: ${policy_case}")
    endif()
  elseif("${result}" STREQUAL "0" OR NOT diagnostic MATCHES "requires GCC 8.3 or newer")
    message(FATAL_ERROR "Unsupported compiler policy case was not explicitly refused: ${policy_case}")
  endif()
endforeach()
