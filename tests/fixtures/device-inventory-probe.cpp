// Explicit test invocation only. No session, device open or redirection.
#include "../../native/devices/inventory.hpp"
#include <cstdio>

int main() {
  try {
    const auto bytes=bridge::devices::discover({31,16});
    const auto report=bridge::ipc::inventory::decode_report(bytes);
    if (report.class_count!=5 || report.device_count>16) return 2;
    for (std::size_t i=0;i<report.class_count;++i) {
      const auto &group=report.classes[i];
      if (static_cast<unsigned>(group.kind)!=i+1) return 2;
      std::printf("{\"class\":%u,\"status\":%u,\"count\":%u}\n",
          static_cast<unsigned>(group.kind),static_cast<unsigned>(group.status),static_cast<unsigned>(group.count));
    }
    return 0;
  } catch (...) {
    std::fputs("Owned inventory probe refused\n",stderr);
    return 2;
  }
}
