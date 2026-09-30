/** Longest address a mail path can carry (RFC 5321). */
const MAX_ADDRESS_LENGTH = 254;

/**
 * Conservative syntax screen for a recipient, not provider-equivalent
 * validation: exactly one "@", a non-empty local part, a dotted domain without
 * empty labels, no whitespace or control characters, at most 254 characters.
 * Plus-addresses, subdomains and internationalized domains pass.
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
    return local.length > 0 && labels.length >= 2 && labels.every((label) => label.length > 0);
}
