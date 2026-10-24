#include "link_probe.hpp"

int first(const char *name);
volatile unsigned char global_storage[8]{};
int main(int count, char **arguments) {
  if (count != 2)
    return 2;
  if (std::string_view(arguments[1]) == "overflow") {
    volatile unsigned int beyond = 8;
    global_storage[beyond] = 1;
    return 0;
  }
  return first(arguments[1]) == 7 && identify(arguments[1]) == 7 ? 0 : 1;
}
