cmake_minimum_required(VERSION 3.24)
project(UsbDescriptorRegression LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Isolated parser project: never included by the root/Release build. No backend
# translation units, context initialization, device enumeration or device I/O.
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
  message(FATAL_ERROR "This pinned POSIX parser fixture is Linux-only")
endif()
set(BRIDGE_LIBUSB_SOURCE "" CACHE PATH "Unmodified pinned libusb 1.0.30 source")
function(check_source relative expected)
  set(path "${BRIDGE_LIBUSB_SOURCE}/${relative}")
  if(NOT EXISTS "${path}" OR IS_DIRECTORY "${path}" OR IS_SYMLINK "${path}")
    message(FATAL_ERROR "Expected a regular pinned libusb source: ${relative}")
  endif()
  file(SIZE "${path}" size)
  if(size GREATER 262144)
    message(FATAL_ERROR "Pinned libusb source exceeds bound: ${relative}")
  endif()
  file(SHA256 "${path}" actual)
  if(NOT actual STREQUAL expected)
    message(FATAL_ERROR "Pinned libusb source hash mismatch: ${relative}")
  endif()
endfunction()
check_source(tests/fuzz/fuzz_descriptor_parsers.c 6d8bd154ccbf404ad8944f9e1aa91a2536640cae84552bc2b54beb5fb1935f0a)
check_source(tests/fuzz/fuzz_bos_descriptor.c 3a541fc3ce1de6f44af18c409078ee65f325099220db8ff4e5d7ff62c7f1e5b5)
check_source(libusb/descriptor.c 4e80077f28a033ba07befceac0347a64ea0e23c34c93b96cfaf8b188d69e401d)
check_source(libusb/libusbi.h cc234f9532988e492459b877cfd2e5e90704555a2a0a5310ee4add39627c7ed9)
check_source(libusb/libusb.h a61260ab145b051b86df2b0575956f01810190abe2c7df6aca831c33bdc8082c)
check_source(libusb/os/events_posix.h f93e407eddc235375aace26fd17065e297cd963e60602002a6c100214a300b1b)
check_source(libusb/os/threads_posix.h a85fbf402195885a8b0484b881b27ad56e22059655e86cf101d67b40fe1ff261)

# A parse_interface() zero return can still own a newly allocated altsetting.
# Apply the regression correction only to a private build copy. The original
# source, shared SDK and Release port remain unchanged and separately tracked.
set(pinned_source "${BRIDGE_LIBUSB_SOURCE}")
set(corpus "${pinned_source}/tests/fuzz/corpus")
set(prepared "${CMAKE_CURRENT_BINARY_DIR}/pinned-libusb")
foreach(relative IN ITEMS tests/fuzz/fuzz_descriptor_parsers.c tests/fuzz/fuzz_bos_descriptor.c
    libusb/descriptor.c libusb/libusbi.h libusb/libusb.h
    libusb/os/events_posix.h libusb/os/threads_posix.h)
  get_filename_component(parent "${prepared}/${relative}" DIRECTORY)
  file(MAKE_DIRECTORY "${parent}")
  configure_file("${BRIDGE_LIBUSB_SOURCE}/${relative}" "${prepared}/${relative}" COPYONLY)
endforeach()
find_program(BRIDGE_LIBUSB_PATCH patch REQUIRED)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
  "${CMAKE_CURRENT_SOURCE_DIR}/interface-ownership.patch")
execute_process(COMMAND "${BRIDGE_LIBUSB_PATCH}" --batch --forward --fuzz=0
  --no-backup-if-mismatch -p1 -i "${CMAKE_CURRENT_SOURCE_DIR}/interface-ownership.patch"
  WORKING_DIRECTORY "${prepared}" RESULT_VARIABLE patch_result
  OUTPUT_VARIABLE patch_output ERROR_VARIABLE patch_error)
if(NOT patch_result EQUAL 0)
  message(FATAL_ERROR "Test-only libusb patch failed: ${patch_output}${patch_error}")
endif()
set(BRIDGE_LIBUSB_SOURCE "${prepared}")

configure_file(config.h.in config.h @ONLY)
add_library(usb-descriptor-harness OBJECT "${BRIDGE_LIBUSB_SOURCE}/tests/fuzz/fuzz_descriptor_parsers.c")
add_library(usb-bos-harness OBJECT "${BRIDGE_LIBUSB_SOURCE}/tests/fuzz/fuzz_bos_descriptor.c")
target_compile_definitions(usb-descriptor-harness PRIVATE LLVMFuzzerTestOneInput=DescriptorInput)
target_compile_definitions(usb-bos-harness PRIVATE LLVMFuzzerTestOneInput=BosInput)
add_executable(usb-descriptor-regression regression.cpp
  $<TARGET_OBJECTS:usb-descriptor-harness> $<TARGET_OBJECTS:usb-bos-harness>)
target_compile_options(usb-descriptor-regression PRIVATE -Wall -Wextra -Wpedantic -Werror)
foreach(target usb-descriptor-harness usb-bos-harness usb-descriptor-regression)
  target_include_directories(${target} PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
  target_include_directories(${target} SYSTEM PRIVATE "${BRIDGE_LIBUSB_SOURCE}/libusb")
  target_compile_options(${target} PRIVATE -fsanitize=address,undefined
    -fno-sanitize-recover=undefined -fno-omit-frame-pointer)
endforeach()
target_link_options(usb-descriptor-regression PRIVATE -fsanitize=address,undefined)

enable_testing()
add_test(NAME usb-bos-values COMMAND usb-descriptor-regression)
add_test(NAME usb-interface-ownership COMMAND usb-descriptor-regression --interface-ownership)
add_test(NAME usb-descriptor-corpus COMMAND usb-descriptor-regression
  "${corpus}")
set_tests_properties(usb-bos-values usb-interface-ownership usb-descriptor-corpus PROPERTIES TIMEOUT 60)
add_test(NAME usb-patch-reconfigure COMMAND "${CMAKE_COMMAND}"
  "-DFIXTURE_SOURCE=${CMAKE_CURRENT_SOURCE_DIR}"
  "-DPINNED_SOURCE=${pinned_source}"
  "-DTEST_ROOT=${CMAKE_CURRENT_BINARY_DIR}/patch-reconfigure-test"
  "-DC_COMPILER=${CMAKE_C_COMPILER}" "-DCXX_COMPILER=${CMAKE_CXX_COMPILER}"
  -P "${CMAKE_CURRENT_SOURCE_DIR}/reconfigure-test.cmake")
set_tests_properties(usb-patch-reconfigure PROPERTIES TIMEOUT 120)

option(BRIDGE_LIBUSB_FUZZERS "Build device-free Clang libFuzzer smoke targets" OFF)
if(BRIDGE_LIBUSB_FUZZERS)
  if(NOT CMAKE_C_COMPILER_ID STREQUAL "Clang")
    message(FATAL_ERROR "The libFuzzer profile requires Clang")
  endif()
  # The renamed descriptor object provides public BOS helpers and inert stubs.
  target_compile_options(usb-descriptor-harness PRIVATE -fsanitize=fuzzer-no-link)
  target_link_options(usb-descriptor-regression PRIVATE -fsanitize=fuzzer-no-link)
  add_executable(usb-descriptor-fuzz "${BRIDGE_LIBUSB_SOURCE}/tests/fuzz/fuzz_descriptor_parsers.c")
  add_executable(usb-bos-fuzz "${BRIDGE_LIBUSB_SOURCE}/tests/fuzz/fuzz_bos_descriptor.c"
    $<TARGET_OBJECTS:usb-descriptor-harness>)
  foreach(target usb-descriptor-fuzz usb-bos-fuzz)
    target_include_directories(${target} PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
    target_include_directories(${target} SYSTEM PRIVATE "${BRIDGE_LIBUSB_SOURCE}/libusb")
    target_compile_options(${target} PRIVATE -fsanitize=fuzzer,address,undefined
      -fno-sanitize-recover=undefined -fno-omit-frame-pointer)
    target_link_options(${target} PRIVATE -fsanitize=fuzzer,address,undefined)
  endforeach()
endif()
