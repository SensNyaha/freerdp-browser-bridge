function(bridge_require_supported_compiler compiler_id compiler_version)
  if("${compiler_id}" STREQUAL "GNU" AND "${compiler_version}" VERSION_LESS "8.3")
    message(FATAL_ERROR "The bridge requires GCC 8.3 or newer; GCC ${compiler_version} is unsupported")
  endif()
endfunction()

function(bridge_require_cxx20_library)
  include(CheckCXXSourceCompiles)
  set(CMAKE_REQUIRED_INCLUDES "${CMAKE_CURRENT_FUNCTION_LIST_DIR}")
  check_cxx_source_compiles("
    #include <compat/bit.hpp>
    #include <compat/span.hpp>
    #include <compat/thread.hpp>
    #include <cstdint>
    static_assert(sizeof(bridge::compat::jthread) > 0);
    constexpr int input[] = {1, 2};
    static_assert(bridge::compat::span<const int>(input).size() == 2);
    int main() { return static_cast<int>(bridge::compat::bit_cast<std::uint32_t>(0.0F)); }
  " BRIDGE_CXX20_LIBRARY)
  if(NOT BRIDGE_CXX20_LIBRARY)
    message(FATAL_ERROR "The bridge requires the checked borrowed-view, representation-copy and joining-thread compatibility APIs")
  endif()
endfunction()
