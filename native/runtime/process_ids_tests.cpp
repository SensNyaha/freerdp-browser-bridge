#include "process_ids.hpp"
#include <catch2/catch_test_macros.hpp>
#include <string>

using bridge::runtime::process_id;
using bridge::runtime::process_ids;

TEST_CASE("Host process IDs retain exact bounded decimal scalar grammar") {
  REQUIRE(process_id(L"1") == 1);
  REQUIRE(process_id(L"0000000001") == 1);
  REQUIRE(process_id(L"4294967295") == 0xffffffffU);
  for (const auto text : {L"", L"0", L"000", L"-1", L"+1", L" 1", L"1 ", L"1x", L"1,2",
                          L"4294967296", L"00000000001", L"\uff11"})
    REQUIRE_FALSE(process_id(text));
  REQUIRE_FALSE(process_id(std::wstring_view(L"1\0", 2)));
}

TEST_CASE("Host process PID lists preserve order and duplicates in fixed sixteen-item storage") {
  const auto one = process_ids(L"123");
  REQUIRE(one.has_value());
  REQUIRE(one->size == 1);
  REQUIRE(one->values[0] == 123);
  const auto three = process_ids(L"123,4294967295,123");
  REQUIRE(three.has_value());
  REQUIRE(three->size == 3);
  REQUIRE(three->values[0] == 123);
  REQUIRE(three->values[1] == 0xffffffffU);
  REQUIRE(three->values[2] == 123);
  std::wstring text;
  for (std::size_t i = 0; i < bridge::runtime::process_batch_limit; ++i) {
    if (i)
      text += L',';
    text += L"4294967295";
  }
  REQUIRE(text.size() == bridge::runtime::process_batch_text_limit);
  const auto full = process_ids(text);
  REQUIRE(full.has_value());
  REQUIRE(full->size == 16);
  for (const auto pid : full->values)
    REQUIRE(pid == 0xffffffffU);
  REQUIRE_FALSE(process_ids(text + L",1"));
  text.clear();
  for (int i = 0; i < 17; ++i)
    text += i ? L",1" : L"1";
  REQUIRE_FALSE(process_ids(text));
}

TEST_CASE("Host process PID list invalid elements refuse the entire input") {
  for (const auto text : {L"", L",1", L"1,", L"1,,2", L"1,0", L"1,-2", L"1,+2", L"1, 2", L"1;2",
                          L"1,4294967296", L"1,00000000001", L"1,\uff12"})
    REQUIRE_FALSE(process_ids(text));
  REQUIRE_FALSE(process_ids(std::wstring_view(L"1,2\0,3", 7)));
  REQUIRE_FALSE(process_ids(std::wstring(176, L'1')));
}
