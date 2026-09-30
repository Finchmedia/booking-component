// ============================================
// SAFE-BY-DEFAULT HTML FOR THE BUILT-IN TEMPLATES
// ============================================

/** Markup that may be inserted as is: `html` output, or a trusted constant wrapped by `raw()`. */
export class SafeHtml {
    private readonly markup: string;

    constructor(markup: string) {
        this.markup = markup;
    }

    toString(): string {
        return this.markup;
    }
}

const ENTITIES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/** Escapes text for element content and quoted attribute values. */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/** For trusted constants such as styles only. Never pass booking data. */
export function raw(markup: string): SafeHtml {
    return new SafeHtml(markup);
}

/**
 * Escapes every interpolation that is not already SafeHtml. A nested fragment
 * must be `html`-tagged itself, otherwise its markup is shown as text.
 */
export function html(strings: TemplateStringsArray, ...values: Array<SafeHtml | string | number>): SafeHtml {
    let markup = strings[0];
    values.forEach((value, i) => {
        markup += (value instanceof SafeHtml ? value.toString() : escapeHtml(String(value))) + strings[i + 1];
    });
    return new SafeHtml(markup);
}
