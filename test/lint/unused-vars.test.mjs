// @vitest-environment node

// Lint L1: in production sources an unused binding fails lint even with an
// '_' prefix (commit edc987f had silenced the F3 signal that way). Tests keep
// the escape for deliberately unused stub parameters. Fixtures are linted
// through the repository's eslint.config.js.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// The fixtures are not files on disk, so they are parsed without the tsconfig
// projects; no-unused-vars needs no type information
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: {
    languageOptions: { parserOptions: { project: null } },
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
});

async function lint(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, filePath) });
  return result.messages.map(({ ruleId, severity, message }) => ({ ruleId, severity, message }));
}

const UNUSED = "@typescript-eslint/no-unused-vars";

const PREFIXED = [
  "const _unused = 1;",
  "export const handler = ({ id: _id }: { id: string }) => 0;",
  "export const callback = (_event: string) => 0;",
].join("\n");

const REST_SIBLING = [
  "export function withoutId(doc: { id: string; name: string }) {",
  "  const { id: _id, ...rest } = doc;",
  "  return rest;",
  "}",
].join("\n");

describe("no-unused-vars in production sources", () => {
  for (const file of ["src/react/lint-fixture.ts", "src/component/lint-fixture.ts"]) {
    it(`fails '_'-prefixed variables, props and parameters in ${file}`, async () => {
      const messages = await lint(PREFIXED, file);
      expect(messages.filter((m) => m.ruleId === UNUSED && m.severity === 2)).toHaveLength(3);
      expect(messages.map((m) => m.message).join("\n")).toMatch(/'_unused'.*'_id'.*'_event'/s);
    });

    it(`allows rest siblings in ${file} (control)`, async () => {
      expect(await lint(REST_SIBLING, file)).toEqual([]);
    });
  }

  it("reports a disable directive that no longer suppresses anything", async () => {
    const messages = await lint(
      [
        "// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tracked",
        "export const used = 1;",
      ].join("\n"),
      "src/react/lint-fixture.ts"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/Unused eslint-disable directive/);
    // Warnings fail the lint script
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.lint).toMatch(/--max-warnings=0\b/);
  });
});

describe("no-unused-vars in tests", () => {
  it("keeps the '_' escape", async () => {
    expect(await lint(PREFIXED, "src/react/lint-fixture.test.ts")).toEqual([]);
  });

  it("still fails an unprefixed unused variable (control)", async () => {
    const messages = await lint("const unused = 1;\nexport {};", "src/react/lint-fixture.test.ts");
    expect(messages).toEqual([expect.objectContaining({ ruleId: UNUSED })]);
  });
});
