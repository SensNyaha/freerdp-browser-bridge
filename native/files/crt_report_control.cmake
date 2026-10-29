# This child intentionally raises a CRT assertion. A failed report must exit
# noninteractively, not block a CI runner or continue after an ignored assert.
if(NOT CMAKE_HOST_WIN32 OR NOT DEFINED BRIDGE_FILE_TEST OR
   NOT IS_ABSOLUTE "${BRIDGE_FILE_TEST}" OR NOT EXISTS "${BRIDGE_FILE_TEST}")
  message(FATAL_ERROR "Owned CRT report control requires its Windows test executable")
endif()
execute_process(
  COMMAND "${BRIDGE_FILE_TEST}" "[.crt-report-control]" "--reporter" "compact"
  RESULT_VARIABLE result
  OUTPUT_VARIABLE output
  ERROR_VARIABLE diagnostic
  TIMEOUT 10
  ENCODING UTF-8)
if(NOT "${result}" STREQUAL "120" OR
   NOT diagnostic MATCHES "Owned negative-control assertion")
  message(FATAL_ERROR "Owned CRT assertion did not produce the expected bounded failure")
endif()
