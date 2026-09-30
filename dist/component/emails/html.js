// ============================================
// SAFE-BY-DEFAULT HTML FOR THE BUILT-IN TEMPLATES
// ============================================
/** Markup that may be inserted as is: `html` output, or a trusted constant wrapped by `raw()`. */
export class SafeHtml {
    markup;
    constructor(markup) {
        this.markup = markup;
    }
    toString() {
        return this.markup;
    }
}
const ENTITIES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
/** Escapes text for element content and quoted attribute values. */
export function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
/** For trusted constants such as styles only. Never pass booking data. */
export function raw(markup) {
    return new SafeHtml(markup);
}
/**
 * Escapes every interpolation that is not already SafeHtml. A nested fragment
 * must be `html`-tagged itself, otherwise its markup is shown as text.
 */
export function html(strings, ...values) {
    let markup = strings[0];
    values.forEach((value, i) => {
        markup += (value instanceof SafeHtml ? value.toString() : escapeHtml(String(value))) + strings[i + 1];
    });
    return new SafeHtml(markup);
}
//# sourceMappingURL=html.js.map