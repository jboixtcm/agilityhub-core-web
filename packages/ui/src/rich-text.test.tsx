import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { sanitizeRichText, serializeRichText } from "./rich-text";
import { RichTextEditor, type RichTextEditorLabels } from "./rich-text-editor";
import { SafeHtml } from "./safe-html";

afterEach(() => {
  cleanup();
});

const labels: RichTextEditorLabels = {
  linkApply: "Aplica",
  linkCancel: "Cancel·la",
  linkInvalid: "Enllaç no vàlid",
  linkUrl: "Adreça de l'enllaç",
  toolbar: "Format",
  tools: {
    blockquote: { glyph: "❝", label: "Cita" },
    bold: { glyph: "B", label: "Negreta" },
    h3: { glyph: "H3", label: "Títol" },
    h4: { glyph: "H4", label: "Subtítol" },
    italic: { glyph: "I", label: "Cursiva" },
    link: { glyph: "", label: "Enllaç" },
    orderedList: { glyph: "1.", label: "Llista numerada" },
    strike: { glyph: "S", label: "Ratllat" },
    underline: { glyph: "U", label: "Subratllat" },
    unorderedList: { glyph: "•", label: "Llista" },
  },
};

describe("R-07-03 rich-text allow-list (T-07-02 on the front)", () => {
  it("keeps the mockup-safe markup and drops everything else", () => {
    expect(
      sanitizeRichText('<p onclick="x()">Cal <b>portar</b> <img src="x.png"> la cartilla</p>'),
    ).toBe("<p>Cal <strong>portar</strong>  la cartilla</p>");
  });

  it("drops <script>, style attributes and elements, classes and ids", () => {
    const html =
      '<h3 id="t" class="big" style="color:red">Horaris</h3><script>alert(1)</script><style>p{}</style><p style="x">Text</p>';
    expect(sanitizeRichText(html)).toBe("<h3>Horaris</h3><p>Text</p>");
  });

  it("maps browser formatting onto the allow-list: <b> → strong, <i> → em, <strike> → s, <div> → p", () => {
    expect(sanitizeRichText("<div><b>a</b> <i>b</i> <strike>c</strike> <u>d</u></div>")).toBe(
      "<p><strong>a</strong> <em>b</em> <s>c</s> <u>d</u></p>",
    );
  });

  it("keeps http(s) and mailto links with rel/target and unwraps javascript: links", () => {
    expect(
      sanitizeRichText(
        '<p><a href="https://example.test/n" title="t">normativa</a> · <a href="mailto:club@example.test">correu</a> · <a href="javascript:alert(1)">x</a> · <a href=" JavaScript:void(0)">y</a></p>',
      ),
    ).toBe(
      '<p><a href="https://example.test/n" rel="noopener" target="_blank">normativa</a> · <a href="mailto:club@example.test" rel="noopener" target="_blank">correu</a> · x · y</p>',
    );
  });

  it("keeps lists, quotes, h4 and line breaks and escapes text", () => {
    expect(
      sanitizeRichText(
        "<h4>Què cal portar</h4><ul><li>aigua &amp; ombra</li></ul><ol><li>1</li></ol><blockquote>cita<br>2</blockquote><p>&lt;b&gt;</p>",
      ),
    ).toBe(
      "<h4>Què cal portar</h4><ul><li>aigua &amp; ombra</li></ul><ol><li>1</li></ol><blockquote>cita<br>2</blockquote><p>&lt;b&gt;</p>",
    );
  });

  it("serializes a DOM subtree (the editor content) with the same rules", () => {
    const root = document.createElement("div");
    root.innerHTML = '<b onclick="x">Hola</b><iframe src="x"></iframe><span style="x">món</span>';
    expect(serializeRichText(root)).toBe("<strong>Hola</strong>món");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeRichText(null)).toBe("");
    expect(sanitizeRichText("  ")).toBe("");
  });
});

describe("SafeHtml", () => {
  it("re-applies the allow-list before rendering and adds rel/target to links", () => {
    const { container } = render(
      <SafeHtml html='<p>Hola <a href="https://example.test">web</a><img src=x onerror="alert(1)"></p><script>alert(2)</script>' />,
    );
    expect(container.querySelector("img, script")).toBeNull();
    const link = screen.getByRole("link", { name: "web" });
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).toHaveAttribute("target", "_blank");
    expect(container.querySelector(".ah-rich-text")?.innerHTML).toBe(
      '<p>Hola <a href="https://example.test" rel="noopener" target="_blank">web</a></p>',
    );
  });

  it("renders nothing without text", () => {
    const { container } = render(<SafeHtml html={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function EditorHarness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RichTextEditor
        id="long"
        label="Descripció llarga"
        labels={labels}
        onChange={setValue}
        value={value}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("RichTextEditor", () => {
  it("offers only the allow-listed tools and emits allow-listed HTML", () => {
    render(<EditorHarness initial='<p>Hola <b>món</b><img src="x"></p>' />);
    expect(screen.getByRole("toolbar", { name: "Format" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Negreta",
      "Cursiva",
      "Subratllat",
      "Ratllat",
      "Títol",
      "Subtítol",
      "Llista",
      "Llista numerada",
      "Cita",
      "Enllaç",
    ]);
    const editor = screen.getByRole("textbox", { name: "Descripció llarga" });
    expect(editor.innerHTML).toBe("<p>Hola <strong>món</strong></p>");

    editor.innerHTML = '<div style="x">Nou <i>text</i></div><script>x</script>';
    fireEvent.input(editor);
    expect(screen.getByTestId("value")).toHaveTextContent("<p>Nou <em>text</em></p>");
  });

  it("refuses a javascript: link", () => {
    render(<EditorHarness initial="<p>Hola</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Enllaç" }));
    fireEvent.change(screen.getByLabelText("Adreça de l'enllaç"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplica" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enllaç no vàlid");
  });

  it("is read-only without a toolbar", () => {
    render(
      <RichTextEditor
        id="ro"
        label="Descripció"
        labels={labels}
        onChange={() => undefined}
        readOnly
        value="<p>Text</p>"
      />,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Descripció" })).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });

  it("E4-W08 R-07-04 while busy (its form saving) refuses input, keeps the toolbar disabled, and unlocks after", () => {
    const changes: string[] = [];
    const editor = (busy: boolean) => (
      <RichTextEditor
        busy={busy}
        id="busy"
        label="Descripció"
        labels={labels}
        onChange={(html) => {
          changes.push(html);
        }}
        value="<p>Desat</p>"
      />
    );
    const { rerender } = render(editor(true));
    const content = screen.getByRole("textbox", { name: "Descripció" });
    expect(content).toHaveAttribute("contenteditable", "false");
    expect(content).toHaveAttribute("aria-readonly", "true");
    const tools = screen.getAllByRole("button");
    expect(tools).toHaveLength(10);
    for (const tool of tools) expect(tool).toBeDisabled();

    content.innerHTML = "<p>Escrit mentre desa</p>";
    fireEvent.input(content);
    expect(content.innerHTML).toBe("<p>Desat</p>");
    expect(changes).toEqual([]);

    rerender(editor(false));
    expect(content).toHaveAttribute("contenteditable", "true");
    expect(content).not.toHaveAttribute("aria-readonly");
    content.innerHTML = "<p>Després</p>";
    fireEvent.input(content);
    expect(changes).toEqual(["<p>Després</p>"]);
  });
});
