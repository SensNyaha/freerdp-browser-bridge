#include "addin_scope.hpp"
#include <algorithm>
#include <exception>
#include <winpr/error.h>

namespace bridge::channels {
std::array<AddinScope *, AddinScope::capacity> AddinScope::stack_{};
std::size_t AddinScope::count_ = 0;
bool AddinScope::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
AddinScope::~AddinScope() {
  if (bound_)
    std::terminate(); // A client must retire resources and detach before wrapper destruction.
}
UINT AddinScope::bind(rdpContext &context, FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN callback) noexcept {
  if (bound_ || used_ || !callback)
    return ERROR_INVALID_STATE;
  const auto caller = std::this_thread::get_id();
  const auto current = freerdp_get_current_addin_provider();
  if (count_) {
    const auto *parent = stack_[count_ - 1];
    if (parent->thread_ != caller || current != parent->callback_)
      return ERROR_INVALID_STATE;
    if (parent->context_ != &context)
      return ERROR_INVALID_PARAMETER;
  }
  if (count_ == capacity)
    return ERROR_NOT_ENOUGH_MEMORY;
  if (current == callback ||
      std::any_of(stack_.begin(), stack_.begin() + count_,
                  [callback](const auto *item) { return item->callback_ == callback; }))
    return ERROR_INVALID_STATE;
  if (freerdp_register_addin_provider(callback, 0) != 0)
    return ERROR_INTERNAL_ERROR;
  callback_ = callback;
  previous_ = current;
  context_ = &context;
  thread_ = caller;
  stack_[count_++] = this;
  bound_ = used_ = true;
  return CHANNEL_RC_OK;
}
bool AddinScope::active() const noexcept {
  return on_thread() && bound_ && count_ &&
         freerdp_get_current_addin_provider() == stack_[count_ - 1]->callback_ &&
         std::find(stack_.begin(), stack_.begin() + count_, this) != stack_.begin() + count_;
}
bool AddinScope::top() const noexcept {
  return on_thread() && bound_ && count_ && stack_[count_ - 1] == this;
}
FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN AddinScope::previous() const noexcept {
  return on_thread() && bound_ ? previous_ : nullptr;
}
UINT AddinScope::close() noexcept {
  if (!bound_)
    return CHANNEL_RC_OK;
  if (!top())
    return ERROR_INVALID_STATE;
  const bool owned = freerdp_get_current_addin_provider() == callback_;
  if (owned && freerdp_register_addin_provider(previous_, 0) != 0)
    return ERROR_INTERNAL_ERROR;
  stack_[--count_] = nullptr;
  bound_ = false;
  callback_ = previous_ = nullptr;
  context_ = nullptr;
  return owned ? CHANNEL_RC_OK : ERROR_INVALID_STATE;
}
} // namespace bridge::channels
