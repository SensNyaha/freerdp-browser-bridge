#include "html.hpp"
#include <algorithm>
#include <array>
#include <optional>
#include <string_view>

namespace bridge::clipboard {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
constexpr std::string_view header = "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\n"
                                    "StartFragment:0000000000\r\nEndFragment:0000000000\r\n";
constexpr std::string_view prefix = "<html><body><!--StartFragment-->";
constexpr std::string_view suffix = "<!--EndFragment--></body></html>";
constexpr std::array<std::string_view, 6> keys{
    "StartHTML", "EndHTML", "StartFragment", "EndFragment", "StartSelection", "EndSelection"};
struct Offset {
  std::size_t value = 0;
  bool present = false, absent = false;
};
bool whitespace(std::uint8_t value) noexcept {
  return value == ' ' || value == '\t' || value == '\r' || value == '\n';
}
std::string_view trim(std::string_view text) noexcept {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t'))
    text.remove_prefix(1);
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t'))
    text.remove_suffix(1);
  return text;
}
std::optional<Offset> number(std::string_view text, bool allow_absent) noexcept {
  text = trim(text);
  if (text == "-1" && allow_absent)
    return Offset{0, true, true};
  if (text.empty())
    return {};
  std::size_t value = 0;
  for (const auto c : text) {
    if (c < '0' || c > '9')
      return {};
    const auto digit = static_cast<std::size_t>(c - '0');
    if (value > (max_item_bytes - digit) / 10)
      return {};
    value = value * 10 + digit;
  }
  return Offset{value, true, false};
}
bool boundary(Bytes bytes, std::size_t at) noexcept {
  return at <= bytes.size() && (at == bytes.size() || (bytes[at] & 0xc0U) != 0x80U);
}
bool overlap(Bytes input, ::bridge::compat::span<std::uint8_t> output) noexcept {
  if (input.empty() || output.empty())
    return false;
  const auto a = reinterpret_cast<std::uintptr_t>(input.data());
  const auto b = reinterpret_cast<std::uintptr_t>(output.data());
  return a <= b ? b - a < input.size() : a - b < output.size();
}
void decimal(::bridge::compat::span<std::uint8_t> output, std::size_t at,
             std::size_t value) noexcept {
  for (std::size_t i = 10; i; --i) {
    output[at + i - 1] = static_cast<std::uint8_t>('0' + value % 10);
    value /= 10;
  }
}
} // namespace

HtmlInspection inspect_html_clipboard(Bytes input, std::size_t maximum) noexcept {
  if (!maximum || maximum > max_item_bytes)
    return {};
  if (input.size() > maximum)
    return {TextStatus::too_large};
  if (input.empty())
    return {};
  std::array<Offset, 6> offsets{};
  bool version = false, source_url = false;
  std::size_t at = 0, lines = 0;
  while (at < input.size()) {
    const bool complete = version && offsets[0].present && offsets[1].present &&
                          offsets[2].present && offsets[3].present;
    std::size_t bound = std::min(input.size(), max_html_header_bytes);
    if (offsets[0].present && !offsets[0].absent)
      bound = std::min(bound, offsets[0].value);
    else if (offsets[2].present)
      bound = std::min(bound, offsets[2].value);
    if (at == bound && complete)
      break;
    if (at >= bound || lines == max_html_header_lines)
      return {};
    const auto begin = at;
    auto end = at;
    while (end < bound && input[end] != '\r' && input[end] != '\n')
      ++end;
    const std::string_view line(reinterpret_cast<const char *>(input.data() + begin), end - begin);
    const auto colon = line.find(':');
    bool key = colon != line.npos && colon > 0 && colon <= 64;
    if (key)
      for (std::size_t i = 0; i < colon; ++i)
        key = key && ((line[i] >= 'A' && line[i] <= 'Z') ||
                      (line[i] >= 'a' && line[i] <= 'z') || line[i] == '-');
    // With no context the bytes before StartFragment may contain marker comments.
    if (complete && !key && !line.empty())
      break;
    if (end == bound)
      return {};
    at = end + 1;
    if (input[end] == '\r' && at < bound && input[at] == '\n')
      ++at;
    ++lines;
    if (line.empty()) {
      if (!complete)
        return {};
      continue;
    }
    if (!key)
      return {};
    for (const auto c : line)
      if ((static_cast<unsigned char>(c) < 0x20 && c != '\t') ||
          static_cast<unsigned char>(c) > 0x7e)
        return {};
    const auto name = line.substr(0, colon), value = trim(line.substr(colon + 1));
    if (name == "Version") {
      if (version || lines != 1 || (value != "0.9" && value != "1.0"))
        return {};
      version = true;
    } else {
      if (!version)
        return {};
      if (name == "SourceURL") {
        if (source_url)
          return {};
        source_url = true; // Metadata is bounded and ignored; never resolve or return the URL.
      }
      for (std::size_t i = 0; i < keys.size(); ++i)
        if (name == keys[i]) {
          if (offsets[i].present)
            return {};
          const auto parsed = number(value, i < 2);
          if (!parsed)
            return {};
          offsets[i] = *parsed;
        }
    }
  }
  if (!version || !offsets[0].present || !offsets[1].present || !offsets[2].present ||
      !offsets[3].present || offsets[0].absent != offsets[1].absent ||
      offsets[4].present != offsets[5].present)
    return {};
  const bool context = !offsets[0].absent;
  std::size_t body_begin = at, body_end = input.size();
  if (context) {
    body_begin = offsets[0].value;
    body_end = offsets[1].value;
    if (body_begin < at || body_begin > max_html_header_bytes ||
        body_begin >= body_end || body_end > input.size())
      return {};
    for (auto i = at; i < body_begin; ++i)
      if (!whitespace(input[i]))
        return {};
  } else {
    while (body_end > at && input[body_end - 1] == 0)
      --body_end;
  }
  for (auto i = body_end; i < input.size(); ++i)
    if (input[i] != 0)
      return {};
  const auto first = offsets[2].value, last = offsets[3].value;
  if (first < body_begin || first > last || last > body_end ||
      !boundary(input, first) || !boundary(input, last) ||
      !valid_clipboard_utf8(input.subspan(body_begin, body_end - body_begin)))
    return {};
  const bool selection = offsets[4].present;
  if (selection &&
      (offsets[4].value < first || offsets[4].value > offsets[5].value ||
       offsets[5].value > last || !boundary(input, offsets[4].value) ||
       !boundary(input, offsets[5].value)))
    return {};
  return {TextStatus::ok, body_begin, body_end - body_begin, first, last - first,
          selection ? offsets[4].value : 0,
          selection ? offsets[5].value - offsets[4].value : 0, context, selection};
}

TextResult encode_html_clipboard(Bytes fragment, ::bridge::compat::span<std::uint8_t> output,
                                 std::size_t maximum) noexcept {
  constexpr auto overhead = header.size() + prefix.size() + suffix.size() + 1;
  if (!maximum || maximum > max_item_bytes || overlap(fragment, output))
    return {TextStatus::invalid};
  if (maximum < overhead || fragment.size() > maximum - overhead)
    return {TextStatus::too_large};
  if (!valid_clipboard_utf8(fragment))
    return {TextStatus::invalid};
  const auto required = overhead + fragment.size();
  if (output.size() < required)
    return {TextStatus::capacity, required};
  std::copy(header.begin(), header.end(), output.begin());
  std::copy(prefix.begin(), prefix.end(), output.begin() + header.size());
  std::copy(fragment.begin(), fragment.end(), output.begin() + header.size() + prefix.size());
  std::copy(suffix.begin(), suffix.end(),
            output.begin() + header.size() + prefix.size() + fragment.size());
  output[required - 1] = 0;
  decimal(output, 23, header.size());
  decimal(output, 43, required - 1);
  decimal(output, 69, header.size() + prefix.size());
  decimal(output, 93, header.size() + prefix.size() + fragment.size());
  return {TextStatus::ok, required};
}
} // namespace bridge::clipboard
