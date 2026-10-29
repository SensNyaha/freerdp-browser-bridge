#pragma once
#include <filesystem>
namespace bridge::runtime {
enum class RecoveryResult { removed, busy, retained };
// Trusted host paths only. Independently validates OS ownership and both signs
// of life. Removes known lifecycle metadata and explicitly claimed managed-file
// trees after complete bounded preflight; every other runtime entry is retained.
RecoveryResult recover_runtime_directory(const std::filesystem::path &root,
                                         const std::filesystem::path &component) noexcept;
} // namespace bridge::runtime
