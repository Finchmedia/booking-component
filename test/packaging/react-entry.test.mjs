// @vitest-environment node

// The published /react entry is plain ESM: Node, Vitest's default dependency
// handling and webpack 5 need fully specified relative imports
// ("./context.js", "./components/calendar/index.js"). The package is compiled
// into a temporary copy (never dist/) and checked there.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Relative module specifiers in compiled code, ignoring comments (JSDoc examples). */
function relativeSpecifiers(code) {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g;
  return [...withoutComments.matchAll(pattern)].map((match) => match[1]);
}

const isFullySpecified = (specifier) => specifier.endsWith(".js");

let workDir;
let packageDir;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "booking-packaging-"));
  packageDir = join(workDir, "package");
  mkdirSync(packageDir);
  execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules/typescript/bin/tsc"),
      "-p",
      join(ROOT, "tsconfig.build.json"),
      "--outDir",
      join(packageDir, "dist"),
      "--tsBuildInfoFile",
      join(workDir, "build.tsbuildinfo"),
    ],
    { cwd: ROOT, stdio: "pipe" }
  );
  writeFileSync(join(packageDir, "package.json"), readFileSync(join(ROOT, "package.json")));
  symlinkSync(join(ROOT, "node_modules"), join(packageDir, "node_modules"), "dir");
}, 120_000);

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("relative imports in the compiled /react entry", () => {
  it("flags extensionless specifiers and ignores comments (control)", () => {
    const sample = [
      "/**",
      ' * import { api } from "./convex/_generated/api";',
      " */",
      'export { Booker } from "./components/booker";',
      'import { useBookingAPI } from "./context.js";',
      'export { Calendar } from "./components/calendar/index.js";',
      'type Api = typeof import("./types");',
      "//# sourceMappingURL=index.js.map",
    ].join("\n");
    const found = relativeSpecifiers(sample);
    expect(found).toEqual([
      "./components/booker",
      "./context.js",
      "./components/calendar/index.js",
      "./types",
    ]);
    expect(found.filter((specifier) => !isFullySpecified(specifier))).toEqual([
      "./components/booker",
      "./types",
    ]);
  });

  it("are fully specified in every .js and .d.ts file", () => {
    const reactDir = join(packageDir, "dist/react");
    const files = readdirSync(reactDir, { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".js") || file.endsWith(".d.ts")
    );
    const specifiers = files.flatMap((file) =>
      relativeSpecifiers(readFileSync(join(reactDir, file), "utf8")).map(
        (specifier) => `${file}: ${specifier}`
      )
    );
    // Not vacuous: the entry is split into many modules
    expect(files.length).toBeGreaterThan(40);
    expect(specifiers.length).toBeGreaterThan(100);
    expect(specifiers.filter((entry) => !isFullySpecified(entry))).toEqual([]);
  });
});

describe("Node ESM import of the compiled package", () => {
  it("loads the root entry (control) and the /react entry", () => {
    const script = join(packageDir, "smoke.mjs");
    writeFileSync(
      script,
      [
        "const result = {};",
        'for (const entry of ["@mrfinch/booking", "@mrfinch/booking/react"]) {',
        "  try {",
        "    result[entry] = { exports: Object.keys(await import(entry)) };",
        "  } catch (error) {",
        '    result[entry] = { error: `${error.code}: ${String(error.message).split("\\n")[0]}` };',
        "  }",
        "}",
        "console.log(JSON.stringify(result));",
      ].join("\n")
    );
    // The copy resolves its own name through package.json "exports"
    const result = JSON.parse(
      execFileSync(process.execPath, [script], { cwd: packageDir, encoding: "utf8" })
    );

    expect(result["@mrfinch/booking"].error).toBeUndefined();
    expect(result["@mrfinch/booking"].exports).toContain("makeInternalBookingAPI");
    expect(result["@mrfinch/booking/react"].error).toBeUndefined();
    expect(result["@mrfinch/booking/react"].exports).toEqual(
      expect.arrayContaining(["Booker", "BookingProvider", "useBookingAPI", "Calendar"])
    );
  });
});

describe("deprecation markers in the compiled /react types", () => {
  it("reach the .d.ts for BookingValidation* and the 'rescheduled' status", () => {
    const types = readFileSync(join(packageDir, "dist/react/types.d.ts"), "utf8");
    const documented = (declaration, marker = "@deprecated") =>
      new RegExp(`${marker}[^/]*\\*/\\s*${declaration}`).test(types);

    expect(documented("export type BookingValidationError\\b")).toBe(true);
    expect(documented("export interface BookingValidationResult\\b")).toBe(true);
    expect(documented("status:", '"rescheduled" is deprecated')).toBe(true);
    // Control: a current type carries no marker
    expect(types).toMatch(/export interface Booking\b/);
    expect(documented("export interface Booking\\b")).toBe(false);
  });
});
