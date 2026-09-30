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
export declare function isSendableAddress(address: string): boolean;
//# sourceMappingURL=recipient.d.ts.map