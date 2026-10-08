#include "certificate.hpp"
#include <memory>
#include <openssl/pem.h>
#include <openssl/x509_vfy.h>
#include <openssl/x509v3.h>
#include <stdexcept>

namespace bridge {
CertificateCheck check_certificate(std::span<const std::uint8_t> pem, const std::string &host) {
  if (pem.empty() || pem.size() > 262144 || host.empty())
    throw std::runtime_error("Invalid certificate");
  const std::unique_ptr<BIO, decltype(&BIO_free)> bio(
      BIO_new_mem_buf(pem.data(), static_cast<int>(pem.size())), BIO_free);
  if (!bio)
    throw std::runtime_error("Certificate allocation failed");
  const std::unique_ptr<X509, decltype(&X509_free)> leaf(
      PEM_read_bio_X509(bio.get(), nullptr, nullptr, nullptr), X509_free);
  if (!leaf)
    throw std::runtime_error("Invalid certificate");
  const auto free_chain = [](STACK_OF(X509) * chain) { sk_X509_pop_free(chain, X509_free); };
  const std::unique_ptr<STACK_OF(X509), decltype(free_chain)> chain(sk_X509_new_null(), free_chain);
  const std::unique_ptr<X509_STORE, decltype(&X509_STORE_free)> store(X509_STORE_new(),
                                                                      X509_STORE_free);
  const std::unique_ptr<X509_STORE_CTX, decltype(&X509_STORE_CTX_free)> verify(X509_STORE_CTX_new(),
                                                                               X509_STORE_CTX_free);
  if (!chain || !store || !verify)
    throw std::runtime_error("Certificate allocation failed");
  while (auto *next = PEM_read_bio_X509(bio.get(), nullptr, nullptr, nullptr)) {
    if (sk_X509_num(chain.get()) >= 15 || sk_X509_push(chain.get(), next) == 0) {
      X509_free(next);
      throw std::runtime_error("Certificate chain limit");
    }
  }
  if (X509_STORE_set_default_paths(store.get()) != 1 ||
      X509_STORE_CTX_init(verify.get(), store.get(), leaf.get(), chain.get()) != 1 ||
      X509_STORE_CTX_set_purpose(verify.get(), X509_PURPOSE_SSL_SERVER) != 1)
    throw std::runtime_error("Certificate verification failed");
  CertificateCheck result{};
  unsigned length = 0;
  if (X509_digest(leaf.get(), EVP_sha256(), result.fingerprint.data(), &length) != 1 ||
      length != 32)
    throw std::runtime_error("Certificate fingerprint failed");
  if (X509_verify_cert(verify.get()) != 1)
    result.flags |= 1;
  // X509_check_ip_asc distinguishes an IP literal from a DNS name.
  const auto ip = X509_check_ip_asc(leaf.get(), host.c_str(), 0);
  const bool name_matches =
      ip >= 0 ? ip == 1
              : X509_check_host(leaf.get(), host.c_str(), host.size(),
                                X509_CHECK_FLAG_NO_PARTIAL_WILDCARDS, nullptr) == 1;
  if (!name_matches)
    result.flags |= 2;
  return result;
}
} // namespace bridge
