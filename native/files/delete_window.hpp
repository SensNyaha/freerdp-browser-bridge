#pragma once
#include "safe_root.hpp"

namespace bridge::files::detail {
inline constexpr unsigned maximum_directory_remove_retries = 8;

// Windows can report a delete-pending child after its name is already hidden.
// The caller keeps the same verified DELETE handle, supplies a fixed monotonic
// deadline and never removes children. No path reopen or transaction replay.
template <class Attempt, class Empty, class Yield, class Within>
Status finish_directory_removal(EntryKind kind, Attempt &&attempt, Empty &&empty,
                                Yield &&yield, Within &&within) {
  auto status = attempt();
  for (unsigned retry = 0;
       kind == EntryKind::directory && status == Status::not_empty &&
       retry < maximum_directory_remove_retries && within(); ++retry) {
    const auto contents = empty();
    if (contents.status != Status::ok || !contents.empty || !within())
      return status;
    yield();
    if (!within()) return status;
    status = attempt();
  }
  return status;
}
} // namespace bridge::files::detail
