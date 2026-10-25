#include "startup-record.hpp"
#include <array>
#include <string>
using namespace bridge::standalone;
int main() {
  const std::string valid =
      "{\"code\":\"STANDALONE_RUNTIME_RECOVERY\",\"supported\":true,\"complete\":true,\"scanned\":"
      "3,\"removed\":1,\"active\":1,\"retained\":1}\n";
  if (parse_startup_record(valid) != StartupRecord::recovery_complete ||
      parse_startup_record("{\"code\":\"STANDALONE_READY\"}\n") != StartupRecord::ready ||
      parse_startup_record("{\"code\":\"STANDALONE_READY\"}\r\n") != StartupRecord::ready ||
      parse_startup_record(
          "{\"code\":\"STANDALONE_RUNTIME_RECOVERY\",\"supported\":false,\"complete\":false,"
          "\"scanned\":0,\"removed\":0,\"active\":0,\"retained\":0}\n") !=
          StartupRecord::recovery_incomplete)
    return 1;
  for (const auto value :
       {std::string(), std::string(257, 'x'), valid.substr(0, valid.size() - 1), valid + "x",
        std::string("{\"code\":\"STANDALONE_READY\",\"secret\":\"sentinel\"}\n")})
    if (parse_startup_record(value))
      return 2;
  for (const auto value :
       {"-1", "1025", "99999999999999999999", "03", "3.0", "\"3\"", "null", "true", "2"}) {
    auto line = valid;
    line.replace(line.find("\"scanned\":3") + 10, 1, value);
    if (parse_startup_record(line))
      return 3;
  }
  for (const auto &field :
       {std::string("supported"), std::string("complete"), std::string("retained")}) {
    auto line = valid;
    line.replace(line.find(field), field.size(), "unknown");
    if (parse_startup_record(line))
      return 4;
  }
  auto incomplete = valid;
  incomplete.replace(incomplete.find("\"complete\":true") + 11, 4, "false");
  if (parse_startup_record(incomplete) != StartupRecord::recovery_incomplete)
    return 5;
  return 0;
}
