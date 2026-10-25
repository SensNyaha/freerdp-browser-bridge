#pragma once
#include <filesystem>
namespace bridge::runtime {
enum class RecoveryResult { removed, busy, retained };
// Trusted host paths only. Independently validates OS ownership and both signs
// of life. Removes only the known marker and an empty directory, never contents.
RecoveryResult recover_runtime_directory(const std::filesystem::path &root,
                                         const std::filesystem::path &component) noexcept;
} // namespace bridge::runtime
