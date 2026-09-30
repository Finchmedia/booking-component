/** Longest address a mail path can carry (RFC 5321). */
const MAX_ADDRESS_LENGTH = 254;

/**
 * One domain label: 1–63 letters, digits and hyphens, not starting or ending
 * with a hyphen. Letters of any script pass, with the combining marks some
 * scripts need, for internationalized domains; punycode (`xn--…`) passes too.
 */
const DOMAIN_LABEL = /^(?!-)[\p{L}\p{M}\p{Nd}-]{1,63}(?<!-)$/u;

/**
 * Conservative syntax screen for a recipient, not provider-equivalent
 * validation: exactly one "@", a non-empty local part, a domain of at least
 * two labels (see DOMAIN_LABEL), no whitespace or control characters, at most
 * 254 characters. Plus-addresses, apostrophes, subdomains and
 * internationalized domains pass.
 *
 * Booking skips built-in mail to an address that fails it, so a malformed
 * booker address cannot fail a provider batch shared with other bookers' mail.
 */
export function isSendableAddress(address: string): boolean {
    if (address.length > MAX_ADDRESS_LENGTH || /[\s\p{Cc}]/u.test(address)) return false;
    const parts = address.split("@");
    if (parts.length !== 2) return false;
    const [local, domain] = parts;
    const labels = domain.split(".");
    return local.length > 0 && labels.length >= 2 && labels.every((label) => DOMAIN_LABEL.test(label));
}
