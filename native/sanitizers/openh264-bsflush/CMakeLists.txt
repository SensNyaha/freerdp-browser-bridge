cmake_minimum_required(VERSION 3.24)
project(OpenH264BsFlushRegression LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Standalone test project only. The Release port/profile does not include this file.
option(BRIDGE_OPENH264_BSFLUSH_FIX "Test the upstream BsFlush build-copy correction" ON)
option(BRIDGE_BSFLUSH_UBSAN "Instrument the regression with nonrecovering UBSan" ON)
set(BRIDGE_OPENH264_SOURCE "" CACHE PATH "Prepared pinned OpenH264 2.6.0 source")
set(header "${BRIDGE_OPENH264_SOURCE}/codec/common/inc/golomb_common.h")
if(NOT EXISTS "${header}" OR IS_DIRECTORY "${header}" OR IS_SYMLINK "${header}")
  message(FATAL_ERROR "Expected a regular pinned OpenH264 Golomb header")
endif()
file(SIZE "${header}" header_size)
if(header_size GREATER 65536)
  message(FATAL_ERROR "Pinned OpenH264 Golomb header exceeds its bound")
endif()
file(READ "${header}" original)
string(REPLACE "\r\n" "\n" original "${original}")
string(SHA256 original_hash "${original}")
if(NOT original_hash STREQUAL "2f0b856c3599749095a774a3cbd85597d6e4421975276c5cf74cd509f8bd6676")
  message(FATAL_ERROR "Pinned OpenH264 Golomb header hash mismatch")
endif()

set(anchor [=[static inline int32_t BsFlush (PBitStringAux pBitString) {
  WRITE_BE_32 (pBitString->pCurBuf, pBitString->uiCurBits << pBitString->iLeftBits);
  pBitString->pCurBuf += 4 - pBitString->iLeftBits / 8;
  pBitString->iLeftBits = 32;
  pBitString->uiCurBits = 0;
  return 0;
}]=])
# Exact function change from cisco/openh264 40555ec684ec0fede3948c8f272c04d88d05189d.
set(replacement [=[static inline int32_t BsFlush (PBitStringAux pBitString) {
  if (pBitString->iLeftBits < 32) {
    WRITE_BE_32 (pBitString->pCurBuf, pBitString->uiCurBits << pBitString->iLeftBits);
    pBitString->pCurBuf += 4 - pBitString->iLeftBits / 8;
    pBitString->iLeftBits = 32;
    pBitString->uiCurBits = 0;
  }
  return 0;
}]=])
set(generated "${original}")
if(BRIDGE_OPENH264_BSFLUSH_FIX)
  string(REPLACE "${anchor}" "${replacement}" generated "${original}")
  if(generated STREQUAL original)
    message(FATAL_ERROR "Pinned OpenH264 BsFlush anchor missing")
  endif()
endif()
string(SHA256 generated_hash "${generated}")
if(BRIDGE_OPENH264_BSFLUSH_FIX AND NOT generated_hash STREQUAL
   "2250df8ab9c364372bc13dd8d9f4ef70c592bc1d10fd11376e792ce89ea3a17e")
  message(FATAL_ERROR "OpenH264 BsFlush correction differs from the upstream header")
endif()
file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(CONFIGURE OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/generated/golomb_common.h"
  CONTENT "${generated}" @ONLY NEWLINE_STYLE LF)
file(SHA256 "${CMAKE_CURRENT_BINARY_DIR}/generated/golomb_common.h" output_hash)
if(NOT output_hash STREQUAL generated_hash)
  message(FATAL_ERROR "OpenH264 BsFlush generated header bytes mismatch")
endif()
message(STATUS "BsFlush original SHA256=${original_hash}; selected SHA256=${output_hash}")

add_executable(bsflush-regression regression.cpp)
target_include_directories(bsflush-regression SYSTEM PRIVATE
  "${CMAKE_CURRENT_BINARY_DIR}/generated"
  "${BRIDGE_OPENH264_SOURCE}/codec/common/inc"
  "${BRIDGE_OPENH264_SOURCE}/codec/api/wels")
if(MSVC)
  target_compile_options(bsflush-regression PRIVATE /W4 /WX /permissive- /utf-8)
else()
  target_compile_options(bsflush-regression PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()
if(BRIDGE_BSFLUSH_UBSAN)
  if(NOT CMAKE_CXX_COMPILER_ID MATCHES "^(GNU|Clang)$")
    message(FATAL_ERROR "The UBSan regression requires GCC or Clang")
  endif()
  target_compile_options(bsflush-regression PRIVATE -fsanitize=undefined
    -fno-sanitize-recover=undefined -fno-omit-frame-pointer)
  target_link_options(bsflush-regression PRIVATE -fsanitize=undefined)
endif()
enable_testing()
add_test(NAME openh264-bsflush-regression COMMAND bsflush-regression)
set_tests_properties(openh264-bsflush-regression PROPERTIES TIMEOUT 15)
