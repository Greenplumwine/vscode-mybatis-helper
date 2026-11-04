import { performance } from "node:perf_hooks";
import { FastMappingEngine } from "../fastMappingEngine";

// These collaborators depend on the VS Code extension host. Signature extraction
// does not use them, so keep this unit test runnable in plain Node.js.
jest.mock("../../../services/parsing/javaMethodParser", () => ({}));
jest.mock("../../../utils/logger", () => ({}));

describe("FastMappingEngine method signature extraction", () => {
  const engine = FastMappingEngine.getInstance();

  it("preserves multiline parameters and annotations", () => {
    const content = [
      "interface ExampleMapper {",
      "    String findById(@Param(\"id\") Long id,",
      "                    @Param(\"state\") String state);",
      "}",
    ].join("\n");

    expect(engine["extractMethodSignature"](content, "findById")).toBe(
      'findById(@Param("id") Long id,\n' +
        '                    @Param("state") String state)',
    );
  });

  it.each([
    ["interface M { String findById(Long id); }", "findById(Long id)"],
    ["public static String findById(Long id) { return null; }", "findById(Long id)"],
    ["List<Map<String, Long>>[] findById(Long[] ids);", "findById(Long[] ids)"],
    ["String findById(Long id) throws IOException, SQLException;", "findById(Long id)"],
    ["String\r\nfindById\r\n(Long id);", "findById(Long id)"],
    ["String findById();", "findById()"],
    ["String findByIdExtra(); String findById(Long id);", "findById(Long id)"],
    ["findById(Long id);", null],
  ])("preserves signature matching for %s", (content, expected) => {
    expect(engine["extractMethodSignature"](content, "findById")).toBe(expected);
  });

  it("returns null when the method is absent", () => {
    expect(
      engine["extractMethodSignature"](
        "interface ExampleMapper { String findById(Long id); }",
        "missingMethod",
      ),
    ).toBeNull();
  });

  it.each([
    ["findById", "findById(Long id)"],
    ["missingMethod", null],
  ])("does not block on unrelated indentation when looking for %s", (name, expected) => {
    const content = [
      "interface ExampleMapper {",
      `${" ".repeat(128)}String unrelated();`,
      "    String findById(Long id);",
      "}",
    ].join("\n");

    const startedAt = performance.now();
    const signature = engine["extractMethodSignature"](content, name);
    const elapsedMs = performance.now() - startedAt;

    expect(signature).toBe(expected);
    // A tiny declaration lookup must not monopolize the extension host. The
    // pathological prefix takes hundreds of milliseconds even on this small input.
    expect(elapsedMs).toBeLessThan(100);
  });
});
