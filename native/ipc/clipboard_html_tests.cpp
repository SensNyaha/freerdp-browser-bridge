#include "clipboard_html.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <string>

using namespace bridge::ipc::clipboard;
using bridge::ipc::ProtocolError;
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
Bytes bytes(std::string_view value) {
  return {reinterpret_cast<const std::uint8_t *>(value.data()), value.size()};
}
const std::vector<std::uint8_t> golden{
    0, 1, 0, 1, 0, 0, 0, 8, 0, 0, 0, 1, 0, 0, 0, 0,
    0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    '<', 'b', '>', 'X', '<', '/', 'b', '>', 'X'};
HtmlItem item(std::string_view value) {
  return {bytes(value), 0, value.size(), 0, 0, false, false, {}};
}
} // namespace
TEST_CASE("HTML private item golden separates empty absent and present fallback with borrowed views") {
  auto value = item("<b>X</b>");
  value.text = bytes("X");
  REQUIRE(encode_html_item(value) == golden);
  const auto decoded = decode_html_item(golden);
  REQUIRE(decoded.body.data() == golden.data() + 32);
  REQUIRE(decoded.body.size() == 8);
  REQUIRE(decoded.text.has_value());
  REQUIRE(decoded.text->data() == golden.data() + 40);
  REQUIRE(decoded.text->size() == 1);
  REQUIRE(encode_html_item(decoded) == golden);
  for (bool empty : {false, true}) {
    auto original = item("<b>X</b>");
    if (empty)
      original.text = Bytes{};
    const auto encoded = encode_html_item(original);
    const auto parsed = decode_html_item(encoded);
    REQUIRE(encoded.size() == 40);
    REQUIRE(parsed.text.has_value() == empty);
    REQUIRE(encode_html_item(parsed) == encoded);
  }
}
TEST_CASE("HTML private item preserves UTF8 context fragment and independent selection without CF headers") {
  const std::string body = "<table><tr><td><b>\xd0\x96\xf0\x9f\x98\x80</b></td></tr></table>";
  const auto fragment = body.find("<b>");
  auto original = item(body);
  original.context = true;
  original.fragment_offset = fragment;
  original.fragment_bytes = 13;
  original.selection = true;
  original.selection_offset = fragment + 3;
  original.selection_bytes = 6;
  const auto encoded = encode_html_item(original);
  const auto parsed = decode_html_item(encoded);
  REQUIRE(parsed.context);
  REQUIRE(parsed.selection);
  REQUIRE(parsed.fragment_offset == fragment);
  REQUIRE(parsed.fragment_bytes == 13);
  REQUIRE(parsed.selection_bytes == 6);
  REQUIRE(std::equal(parsed.body.begin(), parsed.body.end(), bytes(body).begin()));
  REQUIRE(encode_html_item(parsed) == encoded);
  for (unsigned which = 0; which < 4; ++which) {
    auto invalid = original;
    if (which == 0) invalid.fragment_offset = fragment + 4;
    if (which == 1) invalid.fragment_bytes = 6;
    if (which == 2) invalid.selection_offset = fragment + 4;
    if (which == 3) invalid.selection_bytes = 3;
    REQUIRE_THROWS_AS(encode_html_item(invalid), ProtocolError);
  }
}
TEST_CASE("HTML private item refuses every truncation unknown schema flag reserved and inconsistent lengths") {
  for (std::size_t size = 0; size < golden.size(); ++size)
    REQUIRE_THROWS_AS(decode_html_item(Bytes(golden).first(size)), ProtocolError);
  auto extra = golden;
  extra.push_back(0);
  REQUIRE_THROWS_AS(decode_html_item(extra), ProtocolError);
  for (auto at : {0U, 1U, 2U, 3U, 4U, 7U, 8U, 11U, 12U, 15U, 16U, 19U, 20U, 24U, 28U, 31U}) {
    auto invalid = golden;
    invalid[at] = 0xff;
    REQUIRE_THROWS_AS(decode_html_item(invalid), ProtocolError);
  }
  auto missing_text_flag = golden;
  missing_text_flag[3] = 0;
  REQUIRE_THROWS_AS(decode_html_item(missing_text_flag), ProtocolError);
  // The old text command decoder must never accept an HTML item as a command.
  REQUIRE_THROWS_AS(decode_command(golden), ProtocolError);
  for (auto at : {32U, 35U, 40U}) {
    for (const std::uint8_t byte : {std::uint8_t{0}, std::uint8_t{0x80}}) {
      auto invalid = golden;
      invalid[at] = byte;
      REQUIRE_THROWS_AS(decode_html_item(invalid), ProtocolError);
    }
  }
}
TEST_CASE("HTML private item rejects invalid UTF8 NUL split scalars and noncanonical ranges") {
  for (const auto &body : {std::string("x\0y", 3), std::string("\xc0\xaf", 2),
                           std::string("\xed\xa0\x80", 3), std::string("\xf4\x90\x80\x80", 4)})
    REQUIRE_THROWS_AS(encode_html_item(item(body)), ProtocolError);
  for (unsigned which = 0; which < 7; ++which) {
    auto invalid = item("<b>X</b>");
    if (which == 0) invalid.fragment_offset = 1;
    if (which == 1) invalid.fragment_bytes = 7;
    if (which == 2) invalid.selection_offset = 1;
    if (which == 3) invalid.selection_bytes = 1;
    if (which == 4) { invalid.selection = true; invalid.selection_offset = 7; invalid.selection_bytes = 2; }
    if (which == 5) { invalid.context = true; invalid.fragment_offset = 9; }
    if (which == 6) invalid.text = bytes(std::string_view("x\0", 2));
    REQUIRE_THROWS_AS(encode_html_item(invalid), ProtocolError);
  }
  auto invalid = item("");
  invalid.context = true;
  REQUIRE_THROWS_AS(encode_html_item(invalid), ProtocolError);
  REQUIRE(encode_html_item(item("")).size() == 32);
}
TEST_CASE("HTML private item enforces original aggregate and existing outer transport limits") {
  auto value = item("<b>X</b>");
  value.text = bytes("X");
  REQUIRE(encode_html_item(value, 9) == golden);
  REQUIRE_THROWS_AS(encode_html_item(value, 8), ProtocolError);
  REQUIRE_THROWS_AS(decode_html_item(golden, 8), ProtocolError);
  REQUIRE_THROWS_AS(encode_html_item(value, 0), ProtocolError);
  const std::string exact(max_text_bytes - 32, 'A');
  const auto encoded = encode_html_item(item(exact));
  REQUIRE(encoded.size() == max_text_bytes);
  REQUIRE(decode_html_item(encoded).body.size() == exact.size());
  const std::string over(max_text_bytes - 31, 'A');
  REQUIRE_THROWS_AS(encode_html_item(item(over)), ProtocolError);
  auto too_large = encoded;
  too_large.push_back('A');
  REQUIRE_THROWS_AS(decode_html_item(too_large), ProtocolError);
  const std::string expanding(10, '\n');
  value = item("x");
  value.text = bytes(expanding);
  REQUIRE_THROWS_AS(encode_html_item(value, 11), ProtocolError);
}
TEST_CASE("Schema3 clipboard commands retain old text schemas and require canonical HTML items") {
  const std::vector<std::uint8_t> read{0,3,0,4,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2};
  REQUIRE(encode_command({Operation::read_html,1,2,{}}) == read);
  REQUIRE(decode_command(read).operation == Operation::read_html);
  auto set = read;
  set[3] = 5; set[23] = 0;
  set.insert(set.end(),golden.begin(),golden.end());
  REQUIRE(encode_command({Operation::set_html,1,0,golden}) == set);
  REQUIRE(encode_command(decode_command(set)) == set);
  auto result = read;
  result.insert(result.end(),golden.begin(),golden.end());
  REQUIRE(encode_result({Operation::read_html,Status::accepted,1,2,golden}) == result);
  REQUIRE(encode_result(decode_result(result)) == result);
  for (const auto op : {Operation::read_html, Operation::set_html}) {
    for (unsigned status=1;status<=7;++status) {
      auto rejected=encode_result({op,static_cast<Status>(status),1,is_read(op)?2U:0U,{}});
      REQUIRE(rejected.size() == 24);
      rejected.push_back('X');
      REQUIRE_THROWS_AS(decode_result(rejected),ProtocolError);
    }
  }
  for (auto bad : {read,set,result}) {
    for (unsigned schema : {0U,1U,2U,4U}) {
      bad[1]=static_cast<std::uint8_t>(schema);
      REQUIRE_THROWS_AS(decode_command(bad),ProtocolError);
      REQUIRE_THROWS_AS(decode_result(bad),ProtocolError);
    }
  }
  auto contextual = golden;
  contextual[3] |= 2;
  REQUIRE_THROWS_AS(encode_command({Operation::set_html,1,0,contextual}),ProtocolError);
  REQUIRE_NOTHROW(encode_result({Operation::read_html,Status::accepted,1,2,contextual}));
  REQUIRE_THROWS_AS(encode_command({Operation::read_html,1,0,{}}),ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::set_html,1,2,golden}),ProtocolError);
}
TEST_CASE("Schema3 HTML scalar state has explicit selection flags and preserves schema1 bytes") {
  const std::vector<std::uint8_t> html{0,3,1,143,0,16,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2};
  const auto state = decode_state(html);
  REQUIRE(state.html);
  REQUIRE(state.remote_html);
  REQUIRE(state.remote_text);
  REQUIRE_FALSE(state.local_html_accepted);
  const auto encoded = encode_state(state);
  REQUIRE(std::equal(encoded.begin(), encoded.end(), html.begin(),html.end()));
  for (unsigned mode=0;mode<6;++mode) {
    auto bad=state;
    if(mode==0)bad.html=false;
    if(mode==1)bad.ready=false;
    if(mode==2)bad.from_server=false;
    if(mode==3)bad.revision=0;
    if(mode==4)bad.local_html_accepted=true;
    if(mode==5){bad.remote_html=false;bad.local_accepted=true;bad.local_html_accepted=true;bad.to_server=false;}
    REQUIRE_THROWS_AS(encode_state(bad),ProtocolError);
  }
  for(unsigned flags:{0U,127U,1024U,65535U}) {
    auto bad=html;bad[2]=static_cast<std::uint8_t>(flags>>8);bad[3]=static_cast<std::uint8_t>(flags);
    REQUIRE_THROWS_AS(decode_state(bad),ProtocolError);
  }
  auto old=state;old.html=false;old.remote_html=false;
  REQUIRE(encode_state(old)[1] == 1);
}
