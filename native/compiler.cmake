function(bridge_require_supported_compiler compiler_id compiler_version)
  if("${compiler_id}" STREQUAL "GNU" AND "${compiler_version}" VERSION_LESS "12")
    message(FATAL_ERROR "The bridge requires GCC 12 or newer with a C++20 standard library; GCC ${compiler_version} is unsupported")
  endif()
endfunction()

function(bridge_require_cxx20_library)
  include(CheckCXXSourceCompiles)
  check_cxx_source_compiles("
    #include <bit>
    #include <cstdint>
    #include <span>
    #include <thread>
    static_assert(__cpp_lib_span >= 202002L);
    static_assert(__cpp_lib_bit_cast >= 201806L);
    static_assert(__cpp_lib_jthread >= 201911L);
    static_assert(sizeof(std::jthread) > 0);
    static_assert(std::bit_cast<std::uint32_t>(0.0F) == 0);
    int main() { return static_cast<int>(std::span<int>{}.size()); }
  " BRIDGE_CXX20_LIBRARY)
  if(NOT BRIDGE_CXX20_LIBRARY)
    message(FATAL_ERROR "The bridge requires C++20 span, bit_cast and jthread; GNU builds need GCC 12 or newer and matching libstdc++")
  endif()
endfunction()
