// A small, deliberately bounded Org-markup-to-JSX renderer for reference
// document bodies -- not a full Org parser. Handles: paragraphs, `-`/`+`/
// numbered bullet lists (nested by indentation), `#+begin_src ... #+end_src'
// (syntax-highlighted via Prism when the block names a language Prism
// knows, e.g. `#+begin_src java') and `#+begin_example ... #+end_example'
// (always plain -- Org uses this one for literal output/transcripts, not
// code) blocks, `|'-delimited tables, inline emphasis (*bold*, /italic/, _underline_, =code=,
// ~verbatim~), [[url][desc]]/[[url]] links, and bare http(s) URLs
// (auto-linked). Anything it doesn't recognize is shown as plain text --
// it never throws.

import { Fragment, type ReactNode } from "react";
import Prism from "prismjs";
// clike is a base grammar java/javascript extend -- must load before them.
import "prismjs/components/prism-clike";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";

type Block =
  | { type: "code"; lines: string[]; lang: string | null }
  | { type: "list"; lines: string[] }
  | { type: "table"; lines: string[] }
  | { type: "para"; lines: string[] };

interface ListItem {
  content: string;
  children: ListItem[];
}

const LIST_LINE_RE = /^(\s*)(?:[-+]|\d+[.)])\s+(.*)$/;
// `example' is Org's other common verbatim block (typically used for
// pasted output/session transcripts, where `src' would imply a language) --
// unlike `src', it never gets language-based syntax highlighting below.
const BEGIN_SRC_RE = /^#\+begin_src(?:\s+(\S+))?/i;
const BEGIN_EXAMPLE_RE = /^#\+begin_example\b/i;
const END_BLOCK_RE = /^#\+end_(?:src|example)\s*$/i;

function isBlockStart(line: string): boolean {
  return BEGIN_SRC_RE.test(line) || BEGIN_EXAMPLE_RE.test(line);
}

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c]);
}

/** Syntax-highlights CODE as Prism-generated HTML (`<span class="token
 * ...">`-wrapped, colored via the `.token.*` rules in references.css) when
 * LANG names a grammar Prism has loaded above, else just HTML-escapes it
 * verbatim. Prism escapes the source text itself while tokenizing, so this
 * is safe to hand to `dangerouslySetInnerHTML' either way -- there's no
 * unescaped user/file content reaching innerHTML on either path. */
function highlightHtml(code: string, lang: string | null): string {
  const grammar = lang ? Prism.languages[lang.toLowerCase()] : undefined;
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, lang!.toLowerCase());
}

// Groups: 1=bare url, 2=link url, 3=link desc, 4=bold, 5=italic, 6=underline,
// 7=code, 8=verbatim. The bare-url alternative comes first and is tried at
// its own (earlier) starting position before the italic pattern ever gets a
// chance to misread a URL's internal slashes as emphasis markers -- e.g.
// "https://docs.pytorch.org/tutorials/..." has no whitespace around its
// slashes, so without this it reads as alternating italic spans.
//
// Each emphasis marker also requires an Org-style border: the character
// before the opening marker must be start-of-string, whitespace, or one of
// -({'" (never another word or emphasis character), and symmetrically for
// the character after the closing marker. This mirrors Org's own emphasis
// border rule closely enough to avoid two real false positives seen in
// practice: a code identifier like `add_()`/`mul_()` (trailing-underscore
// in-place-op convention) misread as `_..._` underline, and an exponent
// like `x**2 + y**3` misread as `*bold*` (the inner `*` of the `**` pair
// would pass a plain non-word-character check, since `*` isn't \w).
const PRE = "(?<=^|[-\\s({'\"])";
const POST = "(?=$|[-\\s.,;:!?'\")}\\]])";
// =code=/~verbatim~ get a wider border that also accepts `/` -- prose
// chaining two of them back to back, e.g. `=readString=/=writeString=`,
// is common enough in these reference docs to be worth special-casing.
// Not extended to italic's `/` marker itself, which would misread plain
// slash-separated prose/paths (e.g. "path/to/file") as italic spans.
const PRE_CODE = "(?<=^|[-\\s({'\"/])";
const POST_CODE = "(?=$|[-\\s.,;:!?'\")}\\]/])";
// A closing =/~ is only accepted if it isn't itself immediately preceded by
// a character that would make it read as part of a comparison operator --
// `==`, `!=`, `<=`, `>=` -- rather than a genuine closing delimiter. This
// matters because code snippets quoting one of those are common in these
// reference docs (e.g. `=15 % 3 == 0=`, `=count >= 10=`): without it,
// content matching (which otherwise allows any character, including `=`
// itself, in the middle) stops at the first candidate `=` with a valid
// border and leaves the rest dangling as literal text -- which is also
// what Org's own parser does with `==` specifically (verified via
// `org-export-as`), for the same reason. `~~` gets the same treatment for
// symmetry, though it has no equivalent common doubled form in prose.
const NOT_EQ_OPERATOR_LEAD = "(?<![=!<>])";
const NOT_DOUBLED_TILDE = "(?<!~)";
const INLINE_RE = new RegExp(
  `(https?://[^\\s\\]]+[^\\s\\].,;:!?)}'"])` +
    `|\\[\\[([^\\]]+?)\\](?:\\[([^\\]]+?)\\])?\\]` +
    `|${PRE}\\*([^\\s*][^*]*?)\\*${POST}` +
    `|${PRE}/([^\\s/][^/]*?)/${POST}` +
    `|${PRE}_([^\\s_][^_]*?)_${POST}` +
    `|${PRE_CODE}=([^\\s=][\\s\\S]*?)${NOT_EQ_OPERATOR_LEAD}=${POST_CODE}` +
    `|${PRE_CODE}~([^\\s~][\\s\\S]*?)${NOT_DOUBLED_TILDE}~${POST_CODE}`,
  "g"
);

function isListLine(line: string): boolean {
  return LIST_LINE_RE.test(line);
}

// An Org table line is any line whose first non-blank character is `|'. A
// rule line (`|---+---|', or the `|--|' Org writes when a column has no
// name) holds no data: it only marks where the header stops, so it's used
// as a separator below and never emitted as a row.
const TABLE_LINE_RE = /^\s*\|/;
const TABLE_RULE_RE = /^\s*\|[-+|\s]*$/;

function isTableLine(line: string): boolean {
  return TABLE_LINE_RE.test(line);
}

/** Splits one Org table row into its cell texts. Org rows are written
 * `| a | b |' -- the outer pipes are delimiters rather than empty cells, so
 * the empty leading/trailing fields the split produces get dropped. */
function parseRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

/** Splits TABLE lines into a header row plus body rows. Org marks the header
 * with the first rule line: everything above it is the header, everything
 * below is data. A table with no rule (or one whose rule sits at the very
 * top, i.e. nothing above it) is all body and gets no header. Only the first
 * pre-rule row becomes the header -- Org allows multi-line headers, but they
 * don't appear in these docs and a single <thead> row keeps the markup
 * simple. Later rules are just visual grouping and are dropped. */
function parseTable(lines: string[]): { header: string[] | null; rows: string[][] } {
  const ruleAt = lines.findIndex((l) => TABLE_RULE_RE.test(l));
  const hasHeader = ruleAt > 0;
  const header = hasHeader ? parseRow(lines[0]) : null;
  const bodyLines = (hasHeader ? lines.slice(ruleAt + 1) : lines).filter(
    (l) => !TABLE_RULE_RE.test(l)
  );
  return { header, rows: bodyLines.map(parseRow) };
}

/** Strips the common leading whitespace shared by every non-blank line, so
 * body text captured verbatim from an indented Org buffer (aligned under
 * nested headings) renders flush rather than carrying that indentation
 * into every paragraph. */
function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  if (min === 0) return text;
  return lines.map((l) => (l.length >= min ? l.slice(min) : l.trimStart())).join("\n");
}

function splitBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const srcMatch = line.trim().match(BEGIN_SRC_RE);
    if (srcMatch || BEGIN_EXAMPLE_RE.test(line.trim())) {
      const lang = srcMatch ? (srcMatch[1] ?? null) : null;
      const start = i + 1;
      i++;
      while (i < lines.length && !END_BLOCK_RE.test(lines[i].trim())) i++;
      blocks.push({ type: "code", lines: lines.slice(start, i), lang });
      if (i < lines.length) i++; // consume the #+end_src/#+end_example line
      continue;
    }
    if (isTableLine(line)) {
      const start = i;
      while (i < lines.length && isTableLine(lines[i])) i++;
      blocks.push({ type: "table", lines: lines.slice(start, i) });
      continue;
    }
    if (isListLine(line)) {
      const start = i;
      while (i < lines.length && isListLine(lines[i])) i++;
      blocks.push({ type: "list", lines: lines.slice(start, i) });
      continue;
    }
    const start = i;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isListLine(lines[i]) &&
      !isTableLine(lines[i]) &&
      !isBlockStart(lines[i].trim())
    ) {
      i++;
    }
    blocks.push({ type: "para", lines: lines.slice(start, i) });
  }
  return blocks;
}

function parseListLines(lines: string[]): ListItem[] {
  const parsed = lines.map((l) => {
    const m = l.match(LIST_LINE_RE)!;
    return { indent: m[1].length, content: m[2] };
  });
  const roots: ListItem[] = [];
  const stack: { indent: number; node: ListItem }[] = [];
  for (const it of parsed) {
    const node: ListItem = { content: it.content, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= it.indent) stack.pop();
    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ indent: it.indent, node });
  }
  return roots;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let idx = 0;
  INLINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-i${idx++}`;
    if (match[1] !== undefined) {
      const url = match[1];
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
      );
    } else if (match[2] !== undefined) {
      const url = match[2];
      const desc = match[3] ?? url;
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noreferrer">
          {desc}
        </a>
      );
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={key}>{match[4]}</strong>);
    } else if (match[5] !== undefined) {
      nodes.push(<em key={key}>{match[5]}</em>);
    } else if (match[6] !== undefined) {
      nodes.push(<u key={key}>{match[6]}</u>);
    } else if (match[7] !== undefined) {
      nodes.push(<code key={key}>{match[7]}</code>);
    } else if (match[8] !== undefined) {
      nodes.push(<code key={key}>{match[8]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderList(items: ListItem[], keyPrefix: string): ReactNode {
  return (
    <ul className="k-org-list">
      {items.map((item, idx) => {
        const key = `${keyPrefix}-${idx}`;
        return (
          <li key={key}>
            {renderInline(item.content, key)}
            {item.children.length > 0 && renderList(item.children, key)}
          </li>
        );
      })}
    </ul>
  );
}

function renderBlocks(text: string): ReactNode {
  const blocks = splitBlocks(dedent(text));
  return (
    <>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        if (block.type === "code") {
          const code = block.lines.join("\n");
          return (
            <pre key={key} className="k-org-code">
              <code
                className={block.lang ? `language-${block.lang.toLowerCase()}` : undefined}
                dangerouslySetInnerHTML={{ __html: highlightHtml(code, block.lang) }}
              />
            </pre>
          );
        }
        if (block.type === "list") {
          return <div key={key}>{renderList(parseListLines(block.lines), key)}</div>;
        }
        if (block.type === "table") {
          const { header, rows } = parseTable(block.lines);
          return (
            <div key={key} className="k-org-table-wrap">
              <table className="k-org-table">
                {header && (
                  <thead>
                    <tr>
                      {header.map((cell, ci) => (
                        <th key={`${key}-h${ci}`}>{renderInline(cell, `${key}-h${ci}`)}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={`${key}-r${ri}`}>
                      {row.map((cell, ci) => (
                        <td key={`${key}-r${ri}c${ci}`}>
                          {renderInline(cell, `${key}-r${ri}c${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={key} className="k-org-para">
            {block.lines.map((l, li) => (
              <Fragment key={`${key}-l${li}`}>
                {li > 0 && <br />}
                {renderInline(l.trimEnd(), `${key}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/** Renders BODY (raw Org free text, as returned by a `*-body` websocket
 * message) as lightly formatted JSX. Never throws -- any unexpected input
 * falls back to a plain, verbatim block. */
export function renderOrgText(body: string): ReactNode {
  try {
    return renderBlocks(body);
  } catch {
    return <pre className="k-org-code">{body}</pre>;
  }
}
