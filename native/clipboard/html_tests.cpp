#include "html.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <string>
#include <vector>

using namespace bridge::clipboard;
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
Bytes bytes(std::string_view value) {
  return {reinterpret_cast<const std::uint8_t *>(value.data()), value.size()};
}
constexpr std::string_view metadata =
    "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\n"
    "StartFragment:0000000000\r\nEndFragment:0000000000\r\n";
void field(std::string &record, std::string_view key, std::size_t value) {
  const auto begin = record.find(std::string(key) + ":") + key.size() + 1;
  const auto end = record.find_first_of("\r\n", begin);
  const auto width = end - begin;
  const auto digits = std::to_string(value);
  REQUIRE(digits.size() <= width);
  record.replace(begin, width, std::string(width - digits.size(), '0') + digits);
}
std::string document(std::string_view body, std::size_t first, std::size_t length,
                     std::string description = std::string(metadata)) {
  const auto start = description.size();
  description.append(body);
  field(description, "StartHTML", start);
  field(description, "EndHTML", start + body.size());
  field(description, "StartFragment", start + first);
  field(description, "EndFragment", start + first + length);
  description.push_back(0);
  return description;
}
void absent_context(std::string &record, std::string_view key) {
  const auto begin = record.find(std::string(key) + ":") + key.size() + 1;
  record.replace(begin, 10, "        -1");
}
std::string selected(const std::string &record, const HtmlInspection &view) {
  return record.substr(view.fragment_offset, view.fragment_bytes);
}
void invalid(const std::string &record) {
  const auto view = inspect_html_clipboard(bytes(record), max_item_bytes);
  REQUIRE(view.status == TextStatus::invalid);
  REQUIRE(view.body_offset == 0);
  REQUIRE(view.body_bytes == 0);
  REQUIRE(view.fragment_offset == 0);
  REQUIRE(view.fragment_bytes == 0);
  REQUIRE(view.selection_offset == 0);
  REQUIRE(view.selection_bytes == 0);
  REQUIRE_FALSE(view.context);
  REQUIRE_FALSE(view.selection);
}
} // namespace

TEST_CASE("HTML clipboard encoder matches independently specified complete CF_HTML bytes") {
  constexpr std::string_view fragment = "<b>X</b>";
  std::string expected =
      "Version:1.0\r\nStartHTML:0000000105\r\nEndHTML:0000000177\r\n"
      "StartFragment:0000000137\r\nEndFragment:0000000145\r\n"
      "<html><body><!--StartFragment--><b>X</b><!--EndFragment--></body></html>";
  expected.push_back(0);
  REQUIRE(expected.size() == 178);
  std::array<std::uint8_t, 256> output{};
  output.fill(0x5a);
  const auto result = encode_html_clipboard(bytes(fragment), output, 256);
  REQUIRE(result.status == TextStatus::ok);
  REQUIRE(result.bytes == expected.size());
  REQUIRE(std::equal(expected.begin(), expected.end(),
                     reinterpret_cast<const char *>(output.data())));
  REQUIRE(std::all_of(output.begin() + result.bytes, output.end(),
                      [](auto value) { return value == 0x5a; }));
  const auto view = inspect_html_clipboard(bytes(expected), expected.size());
  REQUIRE(view.status == TextStatus::ok);
  REQUIRE(view.context);
  REQUIRE_FALSE(view.selection);
  REQUIRE(view.body_offset == 105);
  REQUIRE(view.body_bytes == 72);
  REQUIRE(view.fragment_offset == 137);
  REQUIRE(view.fragment_bytes == 8);
  REQUIRE(selected(expected, view) == fragment);
}

TEST_CASE("HTML preserves Unicode bytes line endings context and distinct selection offsets") {
  const std::string fragment = "<b>A\xf0\x9f\x98\x80\r\n\xd0\x96</b>";
  const std::string before = "<html><body>unselected<table><tr><td><!--StartFragment-->";
  const std::string after = "<!--EndFragment--></td></tr></table>unselected</body></html>";
  auto record = document(before + fragment + after, before.size(), fragment.size(),
                         std::string(metadata) +
                             "StartSelection:0000000000\r\nEndSelection:0000000000\r\n"
                             "SourceURL:https://example.invalid/private-never-fetched\r\n");
  const auto base = record.find("<html>");
  field(record, "StartSelection", base + before.size() + 3);
  field(record, "EndSelection", base + before.size() + 8);
  const auto view = inspect_html_clipboard(bytes(record), record.size());
  REQUIRE(view.status == TextStatus::ok);
  REQUIRE(view.context);
  REQUIRE(view.selection);
  REQUIRE(selected(record, view) == fragment);
  REQUIRE(view.body_bytes == before.size() + fragment.size() + after.size());
  REQUIRE(record.substr(view.selection_offset, view.selection_bytes) == "A\xf0\x9f\x98\x80");
  std::vector<std::uint8_t> output(512);
  const auto encoded = encode_html_clipboard(bytes(fragment), output, 512);
  REQUIRE(encoded.status == TextStatus::ok);
  const auto wrapped = inspect_html_clipboard(Bytes(output).first(encoded.bytes), 512);
  REQUIRE(wrapped.status == TextStatus::ok);
  REQUIRE(std::equal(fragment.begin(), fragment.end(),
                     reinterpret_cast<const char *>(output.data() + wrapped.fragment_offset)));
  // Offsets into an emoji continuation byte must not become string boundaries.
  field(record, "StartSelection", view.selection_offset + 2);
  invalid(record);
}

TEST_CASE("HTML accepts specified header line endings versions padding and absent context") {
  for (const std::string ending : {"\r\n", "\n", "\r"}) {
    for (const std::string version : {"0.9", "1.0"}) {
      std::string description;
      for (const auto &line : {"Version:" + version, std::string("StartHTML:0000000000"),
                              std::string("EndHTML:0000000000"),
                              std::string("StartFragment:0000000000"),
                              std::string("EndFragment:0000000000")})
        description += line + ending;
      auto record = document("<!--StartFragment--><i>ok</i><!--EndFragment-->", 20, 9,
                             description);
      REQUIRE(inspect_html_clipboard(bytes(record), record.size()).status == TextStatus::ok);
      absent_context(record, "StartHTML");
      absent_context(record, "EndHTML");
      const auto view = inspect_html_clipboard(bytes(record), record.size());
      REQUIRE(view.status == TextStatus::ok);
      REQUIRE_FALSE(view.context);
      REQUIRE(selected(record, view) == "<i>ok</i>");
      record.append(8, '\0');
      REQUIRE(inspect_html_clipboard(bytes(record), record.size()).status == TextStatus::ok);
      record.back() = 'X';
      invalid(record);
    }
  }
  std::string long_header(metadata);
  long_header.insert(long_header.find("StartHTML:") + 10, 2000, '0');
  const auto long_record = document("<p>pad</p>", 0, 10, long_header);
  REQUIRE(inspect_html_clipboard(bytes(long_record), long_record.size()).status == TextStatus::ok);
}

TEST_CASE("HTML header fields offsets and trailing content are validated without partial views") {
  const auto good = document("<p>hello</p>", 3, 5);
  for (const auto key : {"StartHTML", "EndHTML", "StartFragment", "EndFragment"}) {
    auto record = good;
    field(record, key, 16777217);
    invalid(record);
    record = good;
    field(record, key, 0);
    invalid(record);
  }
  auto record = good;
  field(record, "StartFragment", good.size());
  invalid(record);
  record = good;
  field(record, "EndFragment", 106);
  invalid(record);
  record = good;
  absent_context(record, "StartHTML");
  invalid(record);
  record = good;
  record.replace(record.find("Version:1.0"), 11, "Version:1.1");
  invalid(record);
  record = good;
  record.replace(record.find("StartHTML:") + 10, 10, "9999999999");
  invalid(record);
  record = good;
  record.replace(record.find("EndHTML:") + 8, 10, "0000000+12");
  invalid(record);
  record = good;
  record.back() = 'x';
  invalid(record);
  for (const auto extra : {"StartHTML:0000000000\r\n", "Version:1.0\r\n",
                           "StartSelection:0000000000\r\n", "SourceURL:a\r\nSourceURL:b\r\n"})
    invalid(document("<b>x</b>", 0, 8, std::string(metadata) + extra));
  for (const auto key : {"Version", "StartHTML", "EndHTML", "StartFragment", "EndFragment"}) {
    record = good;
    const auto start = record.find(std::string(key) + ":");
    const auto end = record.find("\r\n", start) + 2;
    record.erase(start, end - start);
    invalid(record);
  }
}

TEST_CASE("HTML metadata line and byte ceilings precede arbitrary header scans") {
  std::string extensions;
  for (std::size_t i = 0; i < 27; ++i)
    extensions += "X-Extension:value\r\n";
  const auto exact_lines = document("<b>x</b>", 0, 8, std::string(metadata) + extensions);
  REQUIRE(inspect_html_clipboard(bytes(exact_lines), exact_lines.size()).status == TextStatus::ok);
  invalid(document("<b>x</b>", 0, 8, std::string(metadata) + extensions + "X-Extension:x\r\n"));
  const auto exact_header = std::string(metadata) + "SourceURL:" +
                            std::string(max_html_header_bytes - metadata.size() - 12, 'a') + "\r\n";
  REQUIRE(exact_header.size() == max_html_header_bytes);
  const auto exact = document("<b>x</b>", 0, 8, exact_header);
  REQUIRE(inspect_html_clipboard(bytes(exact), exact.size()).status == TextStatus::ok);
  invalid(document("<b>x</b>", 0, 8, exact_header + "\n"));
  // Whitespace between fields and context cannot bypass the header byte ceiling.
  auto gap = document(std::string(4096, ' ') + "<b>x</b>", 4096, 8);
  field(gap, "StartHTML", metadata.size() + 4096);
  invalid(gap);
}

TEST_CASE("HTML rejects malformed UTF8 NUL and split Unicode scalar offsets atomically") {
  for (const std::string &bad : {std::string("x\0y", 3), std::string("\x80", 1),
                                std::string("\xc0\xaf", 2), std::string("\xed\xa0\x80", 3),
                                std::string("\xf4\x90\x80\x80", 4), std::string("\xe2\x82", 2)}) {
    std::array<std::uint8_t, 512> out{};
    out.fill(0x5a);
    const auto a = encode_html_clipboard(bytes(bad), out, out.size());
    REQUIRE(a.status == TextStatus::invalid);
    REQUIRE(a.bytes == 0);
    REQUIRE(std::all_of(out.begin(), out.end(), [](auto b) { return b == 0x5a; }));
    invalid(document("<p>" + bad + "</p>", 3, bad.size()));
  }
  for (const auto key : {"StartFragment", "EndFragment"}) {
    auto record = document("<p>\xf0\x9f\x98\x80</p>", 3, 4);
    field(record, key, metadata.size() + 4);
    invalid(record);
  }
}

TEST_CASE("HTML exact wire quota capacity overlap and empty content have transactional results") {
  constexpr std::string_view fragment = "<b>X</b>";
  std::array<std::uint8_t, 256> output{};
  for (const auto capacity : {0U, 1U, 169U, 177U}) {
    output.fill(0x5a);
    const auto result = encode_html_clipboard(bytes(fragment),
                                             ::bridge::compat::span(output).first(capacity), 178);
    REQUIRE(result.status == TextStatus::capacity);
    REQUIRE(result.bytes == 178);
    REQUIRE(std::all_of(output.begin(), output.end(), [](auto b) { return b == 0x5a; }));
  }
  REQUIRE(encode_html_clipboard(bytes(fragment), output, 177).status == TextStatus::too_large);
  REQUIRE(encode_html_clipboard({}, output, 170).status == TextStatus::ok);
  const auto empty = inspect_html_clipboard(Bytes(output).first(170), 170);
  REQUIRE(empty.status == TextStatus::ok);
  REQUIRE(empty.fragment_bytes == 0);
  REQUIRE(encode_html_clipboard(Bytes(output).first(2), output, 256).status == TextStatus::invalid);
  REQUIRE(encode_html_clipboard({}, output, 0).status == TextStatus::invalid);
  REQUIRE(inspect_html_clipboard({}, 100).status == TextStatus::invalid);
  const std::vector<std::uint8_t> huge(max_item_bytes + 1, 'A');
  REQUIRE(inspect_html_clipboard(huge, max_item_bytes).status == TextStatus::too_large);
  REQUIRE(encode_html_clipboard(huge, output, max_item_bytes).status == TextStatus::too_large);
  const std::vector<std::uint8_t> exact_fragment(max_item_bytes - 170, 'A');
  std::vector<std::uint8_t> exact_output(max_item_bytes);
  const auto exact = encode_html_clipboard(exact_fragment, exact_output, max_item_bytes);
  REQUIRE(exact.status == TextStatus::ok);
  REQUIRE(exact.bytes == max_item_bytes);
  const auto view = inspect_html_clipboard(exact_output, max_item_bytes);
  REQUIRE(view.status == TextStatus::ok);
  REQUIRE(view.fragment_bytes == exact_fragment.size());
}
