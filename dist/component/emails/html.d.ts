/** Markup that may be inserted as is: `html` output, or a trusted constant wrapped by `raw()`. */
export declare class SafeHtml {
    private readonly markup;
    constructor(markup: string);
    toString(): string;
}
/** Escapes text for element content and quoted attribute values. */
export declare function escapeHtml(value: string): string;
/** For trusted constants such as styles only. Never pass booking data. */
export declare function raw(markup: string): SafeHtml;
/**
 * Escapes every interpolation that is not already SafeHtml. A nested fragment
 * must be `html`-tagged itself, otherwise its markup is shown as text.
 */
export declare function html(strings: TemplateStringsArray, ...values: Array<SafeHtml | string | number>): SafeHtml;
//# sourceMappingURL=html.d.ts.map