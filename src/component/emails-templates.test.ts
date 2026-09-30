// @vitest-environment happy-dom
/**
 * The six built-in email templates (F2, N4). Output is parsed with DOMParser,
 * so the assertions are about elements, not substrings: booking text must stay
 * text, management links come only from bookingEmailLinks, and a stored zone
 * that Intl rejects renders in UTC instead of failing the mail.
 */
import { describe, expect, test } from "vitest";
import type { BookingEmailContext } from "../emails.js";
import { PROCESS_TIME_ZONES, withProcessTimeZones } from "../testing/process-time-zone.js";
import { bookingEmailLinks } from "./emails/context.js";
import { generateBookingApprovedHTML } from "./emails/templates/approved.js";
import { generateBookingCancellationHTML } from "./emails/templates/cancelled.js";
import { generateBookingConfirmationHTML } from "./emails/templates/confirmation.js";
import { generateBookingDeclinedHTML } from "./emails/templates/declined.js";
import { generateBookingPendingHTML } from "./emails/templates/pending.js";
import { generateBookingRescheduledHTML } from "./emails/templates/rescheduled.js";

type Links = BookingEmailContext["links"];
type Fields = { bookerName: string; eventTitle: string; reason: string; timezone: string; links: Links };
type Template = {
  name: string;
  render: (fields: Fields) => string;
  /** Hrefs rendered from a link set, in document order. */
  hrefs: (links: NonNullable<Links>) => string[];
  hasReason: boolean;
  /** `.help-text` paragraphs with and without links. */
  helpTexts: { withLinks: number; withoutLinks: number };
};

const START = Date.UTC(2027, 2, 9, 9); // 10:00 in Berlin (UTC+1)
const END = START + 3_600_000;
const DAY = 86_400_000;
const LINKS = bookingEmailLinks("bk_1_abc", "tok", "https://host.example")!;
const BENIGN: Fields = { bookerName: "Ada", eventTitle: "Consultation", reason: "Plans changed", timezone: "Europe/Berlin", links: LINKS };

const allLinks = (links: NonNullable<Links>) => [links.view, links.reschedule, links.cancel];
const TEMPLATES: Template[] = [
  { name: "confirmation", render: (f) => generateBookingConfirmationHTML({ ...f, start: START, end: END }), hrefs: allLinks, hasReason: false, helpTexts: { withLinks: 0, withoutLinks: 1 } },
  { name: "pending", render: (f) => generateBookingPendingHTML({ ...f, start: START, end: END }), hrefs: (l) => [l.view, l.cancel], hasReason: false, helpTexts: { withLinks: 1, withoutLinks: 1 } },
  { name: "approved", render: (f) => generateBookingApprovedHTML({ ...f, start: START, end: END }), hrefs: allLinks, hasReason: false, helpTexts: { withLinks: 0, withoutLinks: 1 } },
  { name: "declined", render: (f) => generateBookingDeclinedHTML({ ...f, start: START, end: END }), hrefs: () => [], hasReason: true, helpTexts: { withLinks: 1, withoutLinks: 1 } },
  { name: "cancelled", render: (f) => generateBookingCancellationHTML({ ...f, start: START, end: END }), hrefs: () => [], hasReason: true, helpTexts: { withLinks: 1, withoutLinks: 1 } },
  {
    name: "rescheduled",
    render: (f) => generateBookingRescheduledHTML({ ...f, oldStart: START, oldEnd: END, newStart: START + DAY, newEnd: END + DAY }),
    hrefs: allLinks, hasReason: false, helpTexts: { withLinks: 1, withoutLinks: 1 },
  },
];

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function text(doc: Document, selector: string): string | undefined {
  return doc.querySelector(selector)?.textContent ?? undefined;
}

function hrefs(doc: Document): Array<string | null> {
  return [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
}

/** Element structure that booking text must never change. */
function structure(doc: Document) {
  return {
    anchors: hrefs(doc),
    details: doc.querySelectorAll(".details-card").length,
    reasons: doc.querySelectorAll(".reason").length,
    helpTexts: doc.querySelectorAll(".help-text").length,
    footer: text(doc, ".footer-text"),
  };
}

describe("pinned element structure for benign input", () => {
  test.each(TEMPLATES)("$name: anchors, details, reason and help text are real elements", (template) => {
    const doc = parse(template.render(BENIGN));
    expect(structure(doc)).toEqual({
      anchors: template.hrefs(LINKS),
      details: 1,
      reasons: template.hasReason ? 1 : 0,
      helpTexts: template.helpTexts.withLinks,
      footer: "This email was sent by the Booking System",
    });
    expect(text(doc, ".greeting")).toBe("Hi Ada,");
    expect(text(doc, ".event-title")).toBe("Consultation");
    if (template.hasReason) expect(text(doc, ".reason")).toBe("Reason: Plans changed");
  });

  test("benign anchor counts: 3 for confirmation, approved and rescheduled, 2 for pending, none for declined and cancelled", () => {
    const counts = Object.fromEntries(TEMPLATES.map((t) => [t.name, parse(t.render(BENIGN)).querySelectorAll("a").length]));
    expect(counts).toEqual({ confirmation: 3, pending: 2, approved: 3, declined: 0, cancelled: 0, rescheduled: 3 });
  });

  test.each(TEMPLATES)("$name: without links there are no buttons, only the help text", (template) => {
    const doc = parse(template.render({ ...BENIGN, links: undefined }));
    expect(doc.querySelectorAll("a")).toHaveLength(0);
    expect(doc.querySelectorAll(".help-text")).toHaveLength(template.helpTexts.withoutLinks);
  });

  test.each(TEMPLATES.filter((t) => t.hasReason))("$name: no reason, no reason element", (template) => {
    expect(parse(template.render({ ...BENIGN, reason: "" })).querySelectorAll(".reason")).toHaveLength(0);
  });
});

const PAYLOADS = {
  anchor: '<a id="inj" href="https://evil.example/pay">Pay invoice</a>',
  image: '<img id="inj" src="https://evil.example/t.gif">',
  comment: '<a id="inj" href="https://evil.example/pay">Invoice overdue - pay now</a><!--',
  quote: '"><b id="inj">x</b><i title=\'',
};
const FIELDS = ["bookerName", "eventTitle", "reason"] as const;

describe("booking text renders as text (F2)", () => {
  test.each(Object.entries(PAYLOADS))("CONTROL: the %s payload is live markup when interpolated raw", (_, payload) => {
    expect(parse(`<p>${payload}</p><p id="after">details</p>`).querySelector("#inj")).not.toBeNull();
  });

  const cases = TEMPLATES.flatMap((template) =>
    FIELDS.filter((field) => field !== "reason" || template.hasReason).flatMap((field) =>
      Object.entries(PAYLOADS).map(([kind, payload]) => ({ template, field, kind, payload }))));

  test.each(cases)("$template.name: $kind payload in $field creates no element", ({ template, field, payload }) => {
    const doc = parse(template.render({ ...BENIGN, [field]: payload }));
    expect(doc.querySelector("#inj")).toBeNull();
    // The same elements as for benign input: nothing added, nothing swallowed.
    expect(structure(doc)).toEqual(structure(parse(template.render(BENIGN))));
    const shown = { bookerName: text(doc, ".greeting"), eventTitle: text(doc, ".event-title"), reason: text(doc, ".reason") }[field];
    expect(shown).toBe({ bookerName: `Hi ${payload},`, eventTitle: payload, reason: `Reason: ${payload}` }[field]);
  });

  test.each(TEMPLATES)("$name: a comment-terminated name keeps the details text and every link", (template) => {
    const doc = parse(template.render({ ...BENIGN, bookerName: PAYLOADS.comment }));
    expect(hrefs(doc)).toEqual(template.hrefs(LINKS));
    expect(text(doc, ".event-title")).toBe("Consultation");
    expect(doc.querySelector(".subtitle")).not.toBeNull();
  });

  test.each(TEMPLATES)("$name: pre-escaped input is escaped once and shown literally", (template) => {
    const doc = parse(template.render({ ...BENIGN, bookerName: "Tom &amp; Jerry &lt;b&gt;" }));
    expect(text(doc, ".greeting")).toBe("Hi Tom &amp; Jerry &lt;b&gt;,");
    expect(doc.querySelector("b")).toBeNull();
  });

  test.each(TEMPLATES)("$name: umlauts, apostrophes, ampersands and emoji stay readable", (template) => {
    const value = "Zoë O'Brien & Jürgen 🙂 \"Café\"";
    const doc = parse(template.render({ ...BENIGN, bookerName: value, eventTitle: value, reason: value }));
    expect(text(doc, ".greeting")).toBe(`Hi ${value},`);
    expect(text(doc, ".event-title")).toBe(value);
    if (template.hasReason) expect(text(doc, ".reason")).toBe(`Reason: ${value}`);
  });
});

describe("management links come only from bookingEmailLinks", () => {
  const SPECIAL = "a/b?c#d&e\"f'g h+ü";
  const BASE_URLS = [
    ["canonical", "https://host.example", true],
    ["trailing slash", "https://host.example/", true],
    ["path prefix", "https://host.example/app", true],
    ["javascript:", "javascript:alert(1)//", false],
    ["credentials", "https://user:pass@host.example", false],
    ["scheme-less", "host.example", false],
    ["double quote", 'https://host.example/x" data-inj="1', true],
    ["single quote", "https://host.example/x' data-inj='1", true],
  ] as const;
  const IDS = [
    ["plain", "bk_1_abc", "tok"],
    ["special uid", SPECIAL, "tok"],
    ["special token", "bk_1_abc", SPECIAL],
  ] as const;
  const linkTemplates = TEMPLATES.filter((t) => t.name !== "declined" && t.name !== "cancelled");
  const cases = BASE_URLS.flatMap(([baseLabel, baseUrl, valid]) =>
    IDS.map(([idLabel, uid, token]) => ({ baseLabel, baseUrl, valid, idLabel, uid, token })));

  test.each(cases)("$baseLabel baseUrl with $idLabel", ({ baseUrl, valid, uid, token }) => {
    const links = bookingEmailLinks(uid, token, baseUrl);
    expect(links !== undefined).toBe(valid);
    for (const template of linkTemplates) {
      const doc = parse(template.render({ ...BENIGN, links }));
      expect(doc.querySelector("[data-inj]")).toBeNull();
      if (!links) {
        expect(doc.querySelectorAll("a")).toHaveLength(0);
        expect(doc.querySelectorAll(".help-text")).toHaveLength(template.helpTexts.withoutLinks);
        continue;
      }
      expect(hrefs(doc)).toEqual(template.hrefs(links));
      for (const href of hrefs(doc)) {
        const url = new URL(href!);
        expect(url.protocol).toBe("https:");
        expect(url.host).toBe("host.example");
        expect(url.hash).toBe("");
        expect(url.searchParams.get("token")).toBe(token);
        const segments = url.pathname.split("/").slice(1);
        expect(segments).not.toContain(""); // no "//book" from a trailing slash
        expect(decodeURIComponent(segments[segments.indexOf("booking") + 1])).toBe(uid);
      }
    }
  });
});

describe("stored zones that Intl rejects render in UTC (N4)", () => {
  test.each(TEMPLATES)("$name: invalid and empty zones render, labelled UTC; a valid zone is unchanged", async (template) => {
    await withProcessTimeZones(PROCESS_TIME_ZONES, () => {
      for (const timezone of ["Mars/Olympus_Mons", ""]) {
        const doc = parse(template.render({ ...BENIGN, timezone }));
        const body = doc.body.textContent!;
        expect(body).toContain("09:00 AM UTC");
        expect(body).not.toContain("GMT");
        expect(text(doc, ".greeting")).toBe("Hi Ada,");
      }
      // CONTROL: the stored zone is used when Intl accepts it.
      const body = parse(template.render(BENIGN)).body.textContent!;
      expect(body).toContain("10:00 AM GMT+1");
      expect(body).not.toContain("UTC");
    });
  });
});
