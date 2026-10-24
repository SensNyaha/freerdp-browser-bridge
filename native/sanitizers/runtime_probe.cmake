# Do not accept a green suite whose sanitizer runtime silently ignores errors.
foreach(variable ASAN_OPTIONS LSAN_OPTIONS UBSAN_OPTIONS)
  if(DEFINED ENV{${variable}} AND NOT "$ENV{${variable}}" STREQUAL "")
    message(FATAL_ERROR "Sanitizer negative controls require default runtime options")
  endif()
endforeach()
foreach(mode undefined address leak)
  if(DEFINED SANITIZER_NODE)
    execute_process(COMMAND "${SANITIZER_NODE}" --eval
      "if(process.versions.node.split('.')[0]!=='24'||process.config.variables.asan!==1)process.exit(2);require(process.argv[1]).run(process.argv[2]);"
      "${SANITIZER_PROBE}" "${mode}"
      RESULT_VARIABLE result OUTPUT_VARIABLE output ERROR_VARIABLE error
      TIMEOUT 10)
  else()
    execute_process(COMMAND "${SANITIZER_PROBE}" "${mode}"
      RESULT_VARIABLE result OUTPUT_VARIABLE output ERROR_VARIABLE error
      TIMEOUT 10)
  endif()
  if("${result}" STREQUAL "0")
    message(FATAL_ERROR "The ${mode} sanitizer negative control exited successfully")
  endif()
  if(NOT "${result}" MATCHES "^[1-9][0-9]*$")
    message(FATAL_ERROR "The ${mode} sanitizer negative control did not finish with a failure exit code")
  endif()
  string(LENGTH "${output}${error}" size)
  if(size GREATER 65536)
    message(FATAL_ERROR "Sanitizer negative control output exceeded its bound")
  endif()
  if(mode STREQUAL "undefined")
    set(expected "runtime error: signed integer overflow")
  elseif(mode STREQUAL "address")
    set(expected "AddressSanitizer: heap-buffer-overflow")
  else()
    set(expected "LeakSanitizer: detected memory leaks")
  endif()
  if(NOT "${output}${error}" MATCHES "${expected}")
    message(FATAL_ERROR "The ${mode} negative control did not report its expected sanitizer diagnostic")
  endif()
endforeach()
