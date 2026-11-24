import { describe, expect, it } from "vitest";
import { checkSource } from "../scripts/check-no-fake-ui";

function violations(source: string) {
  return checkSource(source, "sample.tsx");
}

function rules(source: string): string[] {
  return violations(source).map((violation) => violation.rule);
}

describe("checkSource fake-href", () => {
  it("flags empty, hash-only, and javascript hrefs", () => {
    expect(rules('<a href="#">Home</a>')).toContain("fake-href");
    expect(rules('<a href="">Home</a>')).toContain("fake-href");
    expect(rules('<a href="javascript:void(0)">Home</a>')).toContain("fake-href");
    expect(rules('<a href={"#"}>Home</a>')).toContain("fake-href");
  });

  it("allows real hrefs", () => {
    expect(rules('<a href="/audit">Audit</a>')).toEqual([]);
    expect(rules("<a href={`/users/${id}`}>User</a>")).toEqual([]);
  });
});

describe("checkSource no-op handlers", () => {
  it("flags empty and no-value handler bodies", () => {
    expect(rules("<button onClick={() => {}}>Go</button>")).toContain("no-op-handler");
    expect(rules("<button onClick={() => undefined}>Go</button>")).toContain("no-op-handler");
    expect(rules("<button onClick={() => void 0}>Go</button>")).toContain("no-op-handler");
    expect(rules("<button onClick={() => { return; }}>Go</button>")).toContain("no-op-handler");
    expect(rules("<input onChange={void 0} />")).toContain("no-op-handler");
    expect(
      rules('<form onSubmit={() => undefined}><button type="submit">Go</button></form>'),
    ).toContain("no-op-handler");
  });

  it("allows handlers that call something", () => {
    expect(rules("<button onClick={() => save()}>Go</button>")).toEqual([]);
    expect(rules("<input onChange={(event) => setEmail(event.target.value)} />")).toEqual([]);
  });
});

describe("checkSource interactive elements", () => {
  it("flags anchors without href", () => {
    expect(rules("<a>Click</a>")).toContain("anchor-without-href");
  });

  it("flags buttons without a real handler or submit form", () => {
    expect(rules("<button>Go</button>")).toContain("button-without-handler");
    expect(rules('<button type="button">Go</button>')).toContain("button-without-handler");
    expect(rules('<button type="submit">Go</button>')).toContain("button-without-handler");
    expect(rules("<Button>Save</Button>")).toContain("button-without-handler");
  });

  it("recognizes real form actions, submit buttons, and formAction", () => {
    expect(rules('<form action={save}><button type="submit">Save</button></form>')).toEqual([]);
    expect(rules('<form onSubmit={handle}><button type="submit">Save</button></form>')).toEqual([]);
    expect(rules('<form method="get"><button type="submit">Search</button></form>')).toEqual([]);
    expect(rules("<button formAction={save}>Save</button>")).toEqual([]);
    expect(rules("<button onClick={handle}>Go</button>")).toEqual([]);
  });

  it("allows a disabled button with an explicit reason", () => {
    expect(rules('<button disabled title="Requires Owner permission">Go</button>')).toEqual([]);
    expect(rules('<button disabled aria-label="Unavailable: no license">Go</button>')).toEqual([]);
  });
});

describe("checkSource user-visible text", () => {
  it("flags placeholder phrases in JSX text and string children", () => {
    for (const phrase of [
      "Coming soon",
      "Planned feature",
      "Lorem ipsum",
      "mock data",
      "dummy value",
      "fake UI",
    ]) {
      expect(rules(`<p>${phrase}</p>`)).toContain("fake-text");
    }
    expect(rules('<p>{"Coming soon"}</p>')).toContain("fake-text");
  });

  it("flags TODO and FIXME in user-visible text", () => {
    expect(rules("<p>TODO: ship this</p>")).toContain("todo-in-text");
    expect(rules("<p>FIXME</p>")).toContain("todo-in-text");
  });

  it("ignores mock keywords in code identifiers and translation keys", () => {
    expect(rules('<p>{t("mock.feature.title")}</p>')).toEqual([]);
    expect(rules('<div className="placeholder-mock-wrapper">Real content</div>')).toEqual([]);
  });
});

describe("checkSource imports", () => {
  it("flags imports from mock, fixture, or dummy paths", () => {
    expect(rules('import { data } from "@/mocks/data";')).toContain("mock-import");
    expect(rules('import "./fixtures/thing";')).toContain("mock-import");
    expect(rules('const loader = import("./dummy/thing");')).toContain("mock-import");
  });

  it("allows ordinary imports", () => {
    expect(rules('import { save } from "@/app/actions/license";')).toEqual([]);
  });
});

describe("checkSource placeholder exemptions", () => {
  it("does not flag the placeholder attribute, placeholder classes, or placeholder labels", () => {
    expect(rules('<input placeholder="Enter your name" />')).toEqual([]);
    expect(rules('<div className="placeholder-block">Content</div>')).toEqual([]);
    expect(
      rules(
        '<label htmlFor="placeholder-field">Placeholder</label><input id="placeholder-field" />',
      ),
    ).toEqual([]);
  });
});

describe("checkSource allow-list", () => {
  it("suppresses a violation with a reasoned comment on the preceding or same line", () => {
    expect(
      rules(["// zero-fake-ui-allow: legacy embed", '<a href="#">Legacy</a>'].join("\n")),
    ).toEqual([]);
    expect(
      rules("<button onClick={() => {}}>Go</button> // zero-fake-ui-allow: legacy handler"),
    ).toEqual([]);
  });

  it("does not suppress without a reason and only suppresses the marked node", () => {
    expect(rules(["// zero-fake-ui-allow:", '<a href="#">Legacy</a>'].join("\n"))).toContain(
      "fake-href",
    );
    const violationsFound = rules(
      ["// zero-fake-ui-allow: legacy embed", '<a href="#">One</a>', '<a href="#">Two</a>'].join(
        "\n",
      ),
    );
    expect(violationsFound).toEqual(["fake-href"]);
  });
});

describe("checkSource report", () => {
  it("reports file name, line number, and rule", () => {
    const found = violations('const unchanged = true;\n<a href="#">Go</a>');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      fileName: "sample.tsx",
      line: 2,
      rule: "fake-href",
    });
  });
});
