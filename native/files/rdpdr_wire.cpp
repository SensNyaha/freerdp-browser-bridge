#include "rdpdr_wire.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

namespace bridge::files::rdpdr {
bool restrict_capabilities(::bridge::compat::span<std::uint8_t> packet) noexcept {
  if (packet.size() < 4) return false;
  const auto word = [&](std::size_t n) { return std::uint32_t(packet[n]) | std::uint32_t(packet[n + 1]) << 8U; };
  if (word(0) != 0x4472 || word(2) != 0x4350) return true;
  if (packet.size() < 8) return false;
  const auto count = word(4);
  if (!count || count > 2) return false;
  std::size_t offset = 8, general = 0;
  bool drive = false;
  for (std::uint32_t n = 0; n < count; ++n) {
    if (packet.size() - offset < 8) return false;
    const auto type = word(offset), size = word(offset + 2);
    if (size < 8 || size > packet.size() - offset || word(offset + 4) != 2 || word(offset + 6)) return false;
    if (type == 1 && size == 44 && !general) general = offset;
    else if (type == 4 && size == 8 && !drive) drive = true;
    else return false;
    offset += size;
  }
  if (offset != packet.size() || !general) return false;
  const auto io = std::uint32_t(packet[general + 20]) | std::uint32_t(packet[general + 21]) << 8U |
                  std::uint32_t(packet[general + 22]) << 16U | std::uint32_t(packet[general + 23]) << 24U;
  for (unsigned n = 0; n < 4; ++n) packet[general + 20 + n] = static_cast<std::uint8_t>((io & managed_io_mask) >> (8U * n));
  // ioCode2/extraFlags1/extraFlags2: no reserved operations or pipelined async IO.
  for (const auto at : {24U, 32U, 36U}) std::fill_n(packet.data() + general + at, 4, std::uint8_t{0});
  return true;
}
bool Ingress::fail() noexcept { failed_ = true;active_ = false;return false; }
bool Ingress::poll(std::uint64_t now) noexcept {
  if (failed_ || closed_) return false;
  if ((clocked_ && now < last_) || (active_ && now >= deadline_)) return fail();
  clocked_ = true;last_ = now;return true;
}
bool Ingress::admit(std::size_t size, std::size_t total, bool first, bool last, std::uint64_t now) noexcept {
  if (!poll(now)) return false;
  if (first) {
    if (active_ || total < 4 || total > maximum_request_bytes + 24 ||
        now > (std::numeric_limits<std::uint64_t>::max)() - 10000) return fail();
    total_ = total;received_ = fragments_ = 0;deadline_ = now + 10000;active_ = true;
  }
  if (!active_ || !size || total != total_ || size > total_ - received_ || ++fragments_ > 4096)
    return fail();
  received_ += size;
  if (last != (received_ == total_)) return fail();
  if (last) active_ = false;
  return true;
}
void Ingress::close() noexcept { closed_ = true;active_ = false; }
namespace {
struct Malformed {};
struct Reader {
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::uint64_t number(unsigned n) {
    if (bytes.size() < n) throw Malformed{};
    std::uint64_t value = 0;
    for (unsigned i = 0; i < n; ++i) value |= std::uint64_t(bytes[i]) << (8U * i);
    bytes = bytes.subspan(n);return value;
  }
  void skip(std::size_t count) {
    if (bytes.size() < count) throw Malformed{};
    bytes = bytes.subspan(count);
  }
  auto tail(std::uint64_t size) {
    if (size != bytes.size()) throw Malformed{};
    return bytes;
  }
};
void put(std::vector<std::uint8_t> &bytes, std::uint64_t value, unsigned count) {
  if (count > maximum_reply_bytes - bytes.size()) throw Malformed{};
  for (unsigned i = 0; i < count; ++i) bytes.push_back(static_cast<std::uint8_t>(value >> (8U * i)));
}
void zero(std::vector<std::uint8_t> &bytes, unsigned count) {
  for (unsigned i = 0; i < count; ++i) put(bytes, 0, 1);
}
void scalar(std::string &text, std::uint32_t cp) {
  unsigned count = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  if (text.size() + count > maximum_path_bytes + 2) throw Malformed{};
  if (count == 1) text.push_back(static_cast<char>(cp));
  else {
    text.push_back(static_cast<char>((count == 2 ? 0xc0U : count == 3 ? 0xe0U : 0xf0U) |
                                      (cp >> (6U * (count - 1)))));
    while (--count) text.push_back(static_cast<char>(0x80U | ((cp >> (6U * (count - 1))) & 63U)));
  }
}
std::vector<std::uint8_t> utf16(std::string_view text) {
  // Only admitted native names (<=255 UTF-8 bytes) or fixed volume labels.
  if (text.size() > maximum_component_bytes) throw Malformed{};
  std::vector<std::uint8_t> bytes;bytes.reserve(text.size() * 2);
  for (std::size_t i = 0; i < text.size();) {
    auto cp = static_cast<std::uint32_t>(static_cast<unsigned char>(text[i++]));
    if (cp >= 0x80) {
      const auto following = cp < 0xe0 ? 1U : cp < 0xf0 ? 2U : 3U;
      cp &= following == 1 ? 31U : following == 2 ? 15U : 7U;
      if (following > text.size() - i) throw Malformed{};
      for (unsigned n = 0; n < following; ++n)
        cp = (cp << 6U) | (static_cast<unsigned char>(text[i++]) & 63U);
    }
    if (cp < 0x10000) put(bytes, cp, 2);
    else { cp -= 0x10000;put(bytes, 0xd800U | (cp >> 10U), 2);put(bytes, 0xdc00U | (cp & 1023U), 2); }
  }
  return bytes;
}
std::pair<std::uint32_t, std::size_t> next_scalar(std::string_view text, std::size_t at) noexcept {
  if (at >= text.size()) return {0, text.size()};
  auto cp = static_cast<std::uint32_t>(static_cast<unsigned char>(text[at++]));
  if (cp >= 0x80) {
    const auto following = cp < 0xe0 ? 1U : cp < 0xf0 ? 2U : 3U;
    cp &= following == 1 ? 31U : following == 2 ? 15U : 7U;
    if (following > text.size() - at) return {0, text.size()};
    for (unsigned n = 0; n < following; ++n) cp = (cp << 6U) | (static_cast<unsigned char>(text[at++]) & 63U);
  }
  return {cp, at};
}
bool same_scalar(std::uint32_t a, std::uint32_t b) noexcept {
  if (a == b) return true;
#ifdef _WIN32
  if (a < 128 && b < 128) {
    if (a >= 'a' && a <= 'z') a -= 32;
    if (b >= 'a' && b <= 'z') b -= 32;
    return a == b;
  }
  wchar_t first[2]{}, second[2]{};
  const auto encode = [](std::uint32_t cp, wchar_t *out) {
    if (cp < 0x10000) { out[0] = static_cast<wchar_t>(cp);return 1; }
    cp -= 0x10000;out[0] = static_cast<wchar_t>(0xd800U | (cp >> 10U));
    out[1] = static_cast<wchar_t>(0xdc00U | (cp & 1023U));return 2;
  };
  const auto n = encode(a, first), m = encode(b, second);
  return CompareStringOrdinal(first, n, second, m, TRUE) == CSTR_EQUAL;
#else
  return false;
#endif
}
bool matches(std::string_view pattern, std::string_view text) noexcept {
  // Bounded UTF-8 glob. '?' and '*' consume whole scalars; DOS expressions
  // are not advertised. Exact names preserve backend case semantics.
  if (pattern == "*" || pattern == "*.*") return true;
  std::size_t p = 0, t = 0, star = pattern.npos, restart = 0;
  while (t < text.size()) {
    if (p < pattern.size() && pattern[p] == '?') {
      ++p;t = next_scalar(text, t).second;
    }
    else if (p < pattern.size() && pattern[p] != '*' &&
             same_scalar(next_scalar(pattern, p).first, next_scalar(text, t).first)) {
      p = next_scalar(pattern, p).second;t = next_scalar(text, t).second;
    }
    else if (p < pattern.size() && pattern[p] == '*') { star = p++;restart = t; }
    else if (star != pattern.npos) {
      p = star + 1;t = next_scalar(text, restart).second;
      restart = t;
    } else return false;
  }
  while (p < pattern.size() && pattern[p] == '*') ++p;
  return p == pattern.size();
}
std::uint32_t attributes(const FileInfo &entry, RootAccess access) {
  return basic_attributes(entry.basic.attributes | (access == RootAccess::read_only ? file_readonly : 0U),
                            entry.kind == EntryKind::directory);
}
std::optional<DriveAccess> access(std::uint32_t desired) {
  // XRDP includes WRITE_DAC in ordinary FUSE create/open requests. As with
  // READ_CONTROL, recognize that hint without mapping it to file data or basic
  // metadata rights: security IRPs remain unsupported and host ACLs stay fixed.
  // WRITE_OWNER, SACL privilege and impersonation remain refused.
  constexpr std::uint32_t known = 0xf0000000U | 0x02000000U | 0x00120000U | 0x00050000U | 0x1ffU;
  if (desired & ~known) return {};
  DriveAccess result = DriveAccess::none;
  if (desired & (0x80000000U | 0x10000000U | 1U)) result = result | DriveAccess::read;
  if (desired & (0x40000000U | 0x10000000U | 2U)) result = result | DriveAccess::write;
  if (desired & 4U) result = result | DriveAccess::append;
  // WRITE_EA and DELETE_CHILD are not WRITE_ATTRIBUTES. Unimplemented EA or
  // parent-delete rights must never authorize BasicInformation mutation.
  if (desired & (0x40000000U | 0x10000000U | 0x100U)) result = result | DriveAccess::metadata_write;
  if (desired & (0x10000000U | 0x00010000U)) result = result | DriveAccess::erase;
  return result;
}
DriveDisposition disposition(std::uint32_t value) {
  switch (value) {
  case 0: return DriveDisposition::supersede;
  case 1: return DriveDisposition::open;
  case 2: return DriveDisposition::create;
  case 3: return DriveDisposition::open_if;
  case 4: return DriveDisposition::overwrite;
  case 5: return DriveDisposition::overwrite_if;
  default: throw Malformed{};
  }
}
} // namespace
NtStatus status(DriveStatus value) noexcept {
  switch (value) {
  case DriveStatus::ok: return NtStatus::success;
  case DriveStatus::invalid: return NtStatus::invalid_parameter;
  case DriveStatus::missing: return NtStatus::no_such_file;
  case DriveStatus::exists: return NtStatus::name_collision;
  case DriveStatus::denied: return NtStatus::access_denied;
  case DriveStatus::busy: case DriveStatus::sharing_violation: return NtStatus::sharing_violation;
  case DriveStatus::limit: case DriveStatus::disk_full: return NtStatus::disk_full;
  case DriveStatus::unavailable: case DriveStatus::retired: case DriveStatus::retained: return NtStatus::device_not_ready;
  case DriveStatus::io: return NtStatus::unsuccessful;
  case DriveStatus::not_empty: return NtStatus::directory_not_empty;
  case DriveStatus::invalid_handle: return NtStatus::invalid_handle;
  case DriveStatus::not_directory: return NtStatus::not_directory;
  case DriveStatus::is_directory: return NtStatus::is_directory;
  case DriveStatus::delete_pending: return NtStatus::delete_pending;
  case DriveStatus::handle_limit: return NtStatus::too_many_open_files;
  }
  return NtStatus::unsuccessful;
}
namespace {
std::optional<std::string> decode_path(::bridge::compat::span<const std::uint8_t> bytes, bool terminated, bool glob) {
  if (bytes.size() > (maximum_path_bytes + 2) * 2 || bytes.size() % 2) return {};
  if (terminated && (bytes.size() < 2 || bytes[bytes.size() - 1] || bytes[bytes.size() - 2])) return {};
  if (bytes.size() >= 2 && !bytes[bytes.size() - 1] && !bytes[bytes.size() - 2])
    bytes = bytes.first(bytes.size() - 2);
  std::string result;result.reserve(std::min(bytes.size(), maximum_path_bytes + 2));
  try {
    Reader input{bytes};
    while (!input.bytes.empty()) {
      auto cp = static_cast<std::uint32_t>(input.number(2));
      if (!cp) return {};
      if (cp >= 0xd800 && cp <= 0xdbff) {
        const auto low = input.number(2);
        if (low < 0xdc00 || low > 0xdfff) return {};
        cp = 0x10000U + ((cp - 0xd800U) << 10U) + static_cast<std::uint32_t>(low - 0xdc00U);
      } else if (cp >= 0xdc00 && cp <= 0xdfff) return {};
      scalar(result, cp == '\\' ? '/' : cp);
    }
  } catch (const Malformed &) { return {}; }
  if (!result.empty() && result.front() == '/') result.erase(0, 1);
  if (!result.empty() && result.front() == '/') return {};
  if (!result.empty() && result.back() == '/') result.pop_back();
  if (!result.empty()) {
    if (!glob && !valid_relative_path(result)) return {};
    if (glob) {
      // Validate directory components as ordinary paths; only the final name
      // can contain glob characters, and it must stay within the name budget.
      const auto slash = result.rfind('/');
      if (slash != result.npos && !valid_relative_path(std::string_view(result).substr(0, slash))) return {};
      auto literal = result.substr(slash == result.npos ? 0 : slash + 1);
      if (literal.size() > maximum_component_bytes) return {};
      for (auto &ch : literal) if (ch == '*' || ch == '?') ch = 'x';
      if (!valid_relative_path(literal)) return {};
    }
  }
  return result;
}
} // namespace
std::optional<std::string> path(::bridge::compat::span<const std::uint8_t> bytes, bool terminated) {
  return decode_path(bytes, terminated, false);
}
Wire::Wire(DriveSession &engine, std::size_t share) : engine_(engine), share_(share) {
  if (engine_.volume(share).status != DriveStatus::ok) throw std::invalid_argument("Invalid drive device");
}
Wire::~Wire() { close(); }
Wire::Enumeration *Wire::enumeration(std::uint32_t key) noexcept {
  if (!key) return nullptr;
  for (auto &item : *enumerations_) if (item.handle == key) return &item;
  return nullptr;
}
void Wire::close() {
  if (closed_) return;
  closed_ = true;
  for (auto &item : *enumerations_) if (item.handle) {
    (void)engine_.close(share_, item.handle);item = {};
  }
}
Reply Wire::request(std::uint32_t major, std::uint32_t minor, std::uint32_t handle,
                     ::bridge::compat::span<const std::uint8_t> bytes) {
  if (closed_) return {NtStatus::device_not_ready, {}, false};
  if (bytes.size() > maximum_request_bytes) return {NtStatus::invalid_parameter, {}, true};
  try { return perform(major, minor, handle, bytes); }
  catch (const Malformed &) { return {NtStatus::invalid_parameter, {}, true}; }
}
Reply Wire::perform(std::uint32_t major, std::uint32_t minor, std::uint32_t key,
                     ::bridge::compat::span<const std::uint8_t> bytes) {
  // An explicitly used mkdir handle is live, even if the attempted operation
  // is later refused. The legacy peer quirk must never join such a handle.
  if (auto *slot = enumeration(key)) slot->xrdp_unused_mkdir = false;
  Reader input{bytes};
  Reply reply;auto &out = reply.bytes;
  // All mutating operations have small fixed replies, reserved before mutation.
  // Reads allocate only after validating the requested transfer bound.
  out.reserve(1024);
  if (minor && major != 12) throw Malformed{};
  if (major == 0) {
    if (key) throw Malformed{};
    const auto desired = static_cast<std::uint32_t>(input.number(4));
    const auto allocation = input.number(8), attrs = input.number(4), shared = input.number(4);
    const auto mode = static_cast<std::uint32_t>(input.number(4));
    const auto options = input.number(4), length = input.number(4);
    // Windows opens a redirected share with PathLength=0 and no terminator.
    // Only that exact empty root selector may omit the UTF-16 terminator.
    const auto name = path(input.tail(length), length != 0);
    if (!name) { reply.status = NtStatus::invalid_parameter;zero(out, 5);return reply; }
    if (shared > 7 || mode > 5 || (options & 1U && options & 64U)) {
      reply.status = NtStatus::invalid_parameter;zero(out, 5);return reply;
    }
    // No raw-device, by-ID, backup/restore or ACL bypass opens.
    // NO_RECALL is satisfied by ordinary private managed files: this backend
    // has no offline-storage/virtualization recall provider. It grants no
    // data/metadata rights or bypass of the retained-root resolver.
    // OPEN_REPARSE_POINT is also valid for ordinary files (Windows DeleteFile
    // uses it). It never enables reparse objects: the retained-root resolver
    // and filesystem owner still refuse symlink/junction/reparse traversal.
    constexpr std::uint64_t allowed_options =
        1U | 4U | 0x10U | 0x20U | 0x40U | 0x800U | 0x1000U | 0x200000U | 0x400000U;
    if ((options & ~allowed_options) || (attrs & ~static_cast<std::uint64_t>(basic_attribute_mask))) {
      reply.status = NtStatus::not_supported;zero(out, 5);return reply;
    }
    const auto volume = engine_.volume(share_);
    if (volume.status != DriveStatus::ok) { reply.status = status(volume.status);zero(out, 5);return reply; }
    DriveOpen request;
    const auto granted = access(desired);
    if (!granted) { reply.status = NtStatus::access_denied;zero(out, 5);return reply; }
    request.path = *name;request.access = *granted;
    request.maximum_allowed = (desired & 0x02000000U) != 0;
    request.share = static_cast<DriveAccess>(shared);request.disposition = disposition(mode);
    request.allocation_bytes = allocation;request.delete_on_close = (options & 0x1000U) != 0;
    request.attributes = static_cast<std::uint32_t>(attrs);
    // XRDP uses this same metadata-only open for lookup and unlink. Keep the
    // handle metadata-only; authorize only disposition at the actual mutation,
    // after read-only/root/sharing checks. Never grant general DELETE/rename.
    request.xrdp_legacy_delete = volume.xrdp_legacy_delete && volume.access == RootAccess::read_write &&
        desired == 0x00100080U && options == 0x20U && mode == 1 &&
        !allocation && !attrs && shared == 7;
    if (options & 1U) request.kind = EntryKind::directory;
    if (options & 64U) request.kind = EntryKind::file;
    auto slot = std::find_if(enumerations_->begin(), enumerations_->end(), [](const auto &item) { return !item.handle; });
    if (slot == enumerations_->end()) { reply.status = NtStatus::too_many_open_files;zero(out, 5);return reply; }
    auto stored_path = *name; // Allocate before backend creation/overwrite.
    const auto opened = engine_.open(share_, request);
    reply.status = status(opened.status);
    put(out, opened.handle, 4);
    const auto information = opened.information == DriveCreated::created ? 2U :
        opened.information == DriveCreated::overwritten ? 3U : opened.information == DriveCreated::superseded ? 0U : 1U;
    put(out, opened.status == DriveStatus::ok ? information : 0, 1);
    if (opened.status == DriveStatus::ok) {
      slot->handle = opened.handle;slot->entry = opened.info.id;slot->directory_path = std::move(stored_path);
      slot->xrdp_legacy_delete = request.xrdp_legacy_delete;
      // XRDP 0.10.6 discards its mkdir IRP without sending CLOSE. Remember
      // only its exact, newly-created directory selector under host opt-in.
      slot->xrdp_unused_mkdir = volume.xrdp_legacy_delete && opened.information == DriveCreated::created &&
          desired == 0x0016019fU && options == 0x21U && mode == 2 &&
          !allocation && (attrs == file_directory || attrs == (file_directory | file_readonly)) && shared == 7;
    }
    return reply;
  }
  if (major == 2) {
    input.skip(32);input.tail(0);
    reply.status = status(engine_.close(share_, key));
    if (auto *slot = enumeration(key)) *slot = {};
    zero(out, 5);return reply;
  }
  if (major == 3 || major == 4) {
    const auto length = input.number(4), offset = input.number(8);
    input.skip(20);
    const auto payload = input.tail(major == 4 ? length : 0);
    const auto maximum = static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
    if (offset > maximum || length > maximum - offset) throw Malformed{};
    if (major == 3) {
      if (length > maximum_transfer_bytes) { reply.status = NtStatus::invalid_parameter;put(out, 0, 4);return reply; }
      const auto count = static_cast<std::size_t>(length);
      out.resize(count + 4);
      std::size_t read = 0;
      do {
        const auto block = std::min(maximum_io_bytes, count - read);
        const auto result = engine_.read(share_, key, offset + read, {out.data() + 4 + read, block});
        if (result.bytes > block) throw Malformed{};
        read += result.bytes;reply.status = status(result.status);
        if (result.status != DriveStatus::ok || result.bytes != block) break;
      } while (read < count);
      for (unsigned n = 0; n < 4; ++n) out[n] = static_cast<std::uint8_t>(read >> (n * 8U));
      out.resize(read + 4);
    } else {
      std::size_t written = 0;
      do {
        const auto block = payload.subspan(written, std::min(maximum_io_bytes, payload.size() - written));
        const auto result = engine_.write(share_, key, offset + written, block);
        if (result.bytes > block.size()) throw Malformed{};
        written += result.bytes;reply.status = status(result.status);
        if (result.status != DriveStatus::ok || result.bytes != block.size()) {
          if (result.status == DriveStatus::ok) reply.status = NtStatus::unsuccessful;
          break;
        }
      } while (written < payload.size());
      put(out, written, 4);put(out, 0, 1);
    }
    return reply;
  }
  if (major == 5 || major == 10) {
    const auto kind = input.number(4), length = input.number(4);
    input.skip(24);input.tail(length);
    if (major == 5) {
      const auto info = engine_.info(share_, key);
      if (info.status != DriveStatus::ok) { reply.status = status(info.status);put(out, 0, 4);return reply; }
      const auto volume = engine_.volume(share_);
      if (volume.status != DriveStatus::ok) { reply.status = status(volume.status);put(out, 0, 4);return reply; }
      if (kind == 4) {
        put(out, 36, 4);
        for (const auto value : info.info.basic.times) put(out, value, 8);
        put(out, attributes(info.info, volume.access), 4);
      } else if (kind == 5) {
        put(out, 22, 4);put(out, info.info.bytes, 8);put(out, info.info.bytes, 8);
        put(out, 1, 4);put(out, info.delete_pending ? 1 : 0, 1);
        put(out, info.info.kind == EntryKind::directory ? 1 : 0, 1);
      } else if (kind == 35) {
        put(out, 8, 4);put(out, attributes(info.info, volume.access), 4);put(out, 0, 4);
      } else { reply.status = NtStatus::not_supported;put(out, 0, 4); }
    } else {
      const auto volume = engine_.volume(share_);
      if (volume.status != DriveStatus::ok) { reply.status = status(volume.status);put(out, 0, 4);return reply; }
      if (kind == 1) {
        const auto label = utf16("BRIDGE");
        put(out, 17 + label.size(), 4);put(out, 0, 8);put(out, 1, 4);put(out, label.size(), 4);
        put(out, 0, 1);out.insert(out.end(), label.begin(), label.end());
      } else if (kind == 3 || kind == 7) {
        put(out, kind == 3 ? 24 : 32, 4);put(out, volume.total / 4096, 8);
        put(out, volume.available / 4096, 8);
        if (kind == 7) put(out, volume.available / 4096, 8);
        put(out, 8, 4);put(out, 512, 4);
      } else if (kind == 4) {
        put(out, 8, 4);put(out, 7, 4);put(out, 0x10, 4); // FILE_DEVICE_DISK / FILE_REMOTE_DEVICE
      } else if (kind == 5) {
        const auto label = utf16("BRIDGE");
        std::uint32_t flags = 2U | 4U; // Case-preserved / Unicode.
#ifndef _WIN32
        flags |= 1U; // POSIX owner uses case-sensitive names.
#endif
        if (volume.access == RootAccess::read_only) flags |= 0x80000U;
        put(out, 12 + label.size(), 4);put(out, flags, 4);put(out, 255, 4);put(out, label.size(), 4);
        out.insert(out.end(), label.begin(), label.end());
      } else { reply.status = NtStatus::not_supported;put(out, 0, 4); }
    }
    return reply;
  }
  if (major == 6) {
    const auto kind = input.number(4), length = input.number(4);
    input.skip(24);input.tail(length);
    if (kind == 4) {
      if (length != 36 && length != 40) throw Malformed{};
      FileBasic basic;
      for (auto &value : basic.times) value = input.number(8);
      basic.attributes = static_cast<std::uint32_t>(input.number(4));
      if (length == 40) input.skip(4); // FSCC reserved field, ignored if present.
      reply.status = (basic.attributes & ~basic_attribute_mask) ? NtStatus::not_supported :
          status(engine_.set_basic(share_, key, basic));
    } else if (kind == 20 || kind == 19) {
      if (length != 8) throw Malformed{};
      const auto bytes_count = input.number(8);
      reply.status = status(engine_.resize(share_, key, bytes_count));
    } else if (kind == 13) {
      if (length > 1) throw Malformed{};
      const auto value = length ? input.number(1) : 1;
      reply.status = status(engine_.remove_on_close(share_, key, value != 0));
      const auto *deleting = enumeration(key);
      if (reply.status == NtStatus::success && value && deleting && deleting->xrdp_legacy_delete) {
        // Only an already-authorized disposition can join unused mkdir
        // handles of this same entry/device. Active and alias handles remain
        // owned until their real CLOSE. The deleting handle stays open, so
        // ordinary last-close deletion and native pin checks still apply.
        const auto entry = deleting->entry;
        for (auto &item : *enumerations_) if (item.handle && item.entry == entry && item.xrdp_unused_mkdir) {
          const auto closed = engine_.close(share_, item.handle);
          item = {};
          if (closed != DriveStatus::ok) { reply.status = status(closed);break; }
        }
      }
    } else if (kind == 10) {
      const auto replace = input.number(1), root = input.number(1), size = input.number(4);
      if (replace > 1 || root) throw Malformed{};
      auto name = path(input.tail(size), false);
      reply.status = name ? status(engine_.rename(share_, key, *name, replace != 0)) : NtStatus::invalid_parameter;
      if (reply.status == NtStatus::success) if (auto *slot = enumeration(key)) slot->directory_path = std::move(*name);
    } else reply.status = NtStatus::not_supported;
    put(out, length, 4);return reply;
  }
  if (major == 12 && minor == 1) {
    const auto kind = input.number(4), initial = input.number(1), length = input.number(4);
    input.skip(23);
    if (kind != 1 && kind != 2 && kind != 3 && kind != 12) {
      reply.status = NtStatus::not_supported;put(out, 0, 4);return reply;
    }
    auto *slot = enumeration(key);
    if (!slot) { reply.status = NtStatus::invalid_handle;put(out, 0, 4);return reply; }
    if (initial) {
      auto pattern = decode_path(input.tail(length), true, true);
      if (!pattern) { reply.status = NtStatus::invalid_parameter;put(out, 0, 4);return reply; }
      const auto slash = pattern->rfind('/');
      if (slash != pattern->npos && !matches(pattern->substr(0, slash), slot->directory_path)) {
        reply.status = NtStatus::invalid_parameter;put(out, 0, 4);return reply;
      }
      slot->pattern = pattern->empty() ? "*" : pattern->substr(slash == pattern->npos ? 0 : slash + 1);
      slot->started = true;slot->exhausted = false;slot->after = 0;
    } else if (!slot->started) { reply.status = NtStatus::invalid_parameter;put(out, 0, 4);return reply; }
    if (slot->exhausted) { reply.status = initial ? NtStatus::no_such_file : NtStatus::no_more_files;zero(out, 5);return reply; }
    const auto emit = [&](const FileInfo &entry) {
      const auto name = utf16(entry.name);
      const auto header = kind == 12 ? 12U : kind == 1 ? 64U : kind == 2 ? 68U : 93U;
      const auto volume = engine_.volume(share_);
      if (volume.status != DriveStatus::ok) { reply.status = status(volume.status);put(out, 0, 4);return; }
      put(out, header + name.size(), 4);put(out, 0, 4);put(out, 0, 4);
      if (kind != 12) {
        for (const auto value : entry.basic.times) put(out, value, 8);
        put(out, entry.bytes, 8);put(out, entry.bytes, 8);
        put(out, attributes(entry, volume.access), 4);
      }
      put(out, name.size(), 4);
      if (kind == 2 || kind == 3) put(out, 0, 4);
      if (kind == 3) { put(out, 0, 1);zero(out, 24); }
      out.insert(out.end(), name.begin(), name.end());
    };
    // One returned entry, bounded scanning by the admitted namespace size. Each
    // page cursor progresses, so an unmatching glob cannot create an IO queue.
    for (;;) {
      auto page = engine_.list(share_, key, slot->after, 64);
      if (page.status != DriveStatus::ok) { reply.status = status(page.status);put(out, 0, 4);return reply; }
      for (const auto &entry : page.entries) {
        slot->after = entry.id;
        if (!matches(slot->pattern, entry.name)) continue;
        emit(entry);return reply;
      }
      if (!page.next) break;
      if (page.next <= slot->after && page.entries.empty()) throw Malformed{};
      slot->after = page.next;
    }
    slot->exhausted = true;
    // A directory has a virtual self entry, returned after its children. This
    // lets an empty wildcard scan finish normally without replacing the
    // required initial NO_SUCH_FILE for a genuinely unmatched filter. No
    // parent path, native entry, quota charge or additional handle is exposed.
    if (matches(slot->pattern, ".")) {
      auto self = engine_.info(share_, key);
      if (self.status != DriveStatus::ok) { reply.status = status(self.status);put(out, 0, 4);return reply; }
      self.info.name = ".";emit(self.info);return reply;
    }
    reply.status = initial ? NtStatus::no_such_file : NtStatus::no_more_files;zero(out, 5);return reply;
  }
  reply.status = NtStatus::not_supported;put(out, 0, 4);return reply;
}
} // namespace bridge::files::rdpdr
