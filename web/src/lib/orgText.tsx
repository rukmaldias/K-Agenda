// A small, deliberately bounded Org-markup-to-JSX renderer for reference
// document bodies -- not a full Org parser. Handles: paragraphs, `-`/`+`/
// numbered bullet lists (nested by indentation), `#+begin_src ... #+end_src`
// blocks (verbatim, monospace), inline emphasis (*bold*, /italic/,
// _underline_, =code=, ~verbatim~), [[url][desc]]/[[url]] links, and bare
// http(s) URLs (auto-linked). Anything it doesn't recognize is shown as
// plain text -- it never throws.

import type { ReactNode } from "react";

type Block =
  | { type: "code"; lines: string[] }
  | { type: "list"; lines: string[] }
  | { type: "para"; lines: string[] };

interface ListItem {
  content: string;
  children: ListItem[];
}

const LIST_LINE_RE = /^(\s*)(?:[-+]|\d+[.)])\s+(.*)$/;
const BEGIN_SRC_RE = /^#\+begin_src\b/i;
const END_SRC_RE = /^#\+end_src\s*$/i;

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
const INLINE_RE = new RegExp(
  `(https?://[^\\s\\]]+[^\\s\\].,;:!?)}'"])` +
    `|\\[\\[([^\\]]+?)\\](?:\\[([^\\]]+?)\\])?\\]` +
    `|${PRE}\\*([^\\s*][^*]*?)\\*${POST}` +
    `|${PRE}/([^\\s/][^/]*?)/${POST}` +
    `|${PRE}_([^\\s_][^_]*?)_${POST}` +
    `|${PRE}=([^\\s=][^=]*?)=${POST}` +
    `|${PRE}~([^\\s~][^~]*?)~${POST}`,
  "g"
);

function isListLine(line: string): boolean {
  return LIST_LINE_RE.test(line);
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
    if (BEGIN_SRC_RE.test(line.trim())) {
      const start = i + 1;
      i++;
      while (i < lines.length && !END_SRC_RE.test(lines[i].trim())) i++;
      blocks.push({ type: "code", lines: lines.slice(start, i) });
      if (i < lines.length) i++; // consume the #+end_src line
      continue;
    }
    if (isListLine(line)) {
      const start = i;
      while (i < lines.length && isListLine(lines[i])) i++;
      blocks.push({ type: "list", lines: lines.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].trim() !== "" && !isListLine(lines[i]) && !BEGIN_SRC_RE.test(lines[i].trim())) {
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
          return (
            <pre key={key} className="k-org-code">
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          return <div key={key}>{renderList(parseListLines(block.lines), key)}</div>;
        }
        const joined = block.lines.map((l) => l.trim()).join(" ");
        return (
          <p key={key} className="k-org-para">
            {renderInline(joined, key)}
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
