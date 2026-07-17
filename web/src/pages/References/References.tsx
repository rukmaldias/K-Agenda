import { useEffect, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useReferenceBody, useReferenceSearch, useReferenceTree } from "../../lib/ws";
import { renderOrgText } from "../../lib/orgText";
import type { ReferenceNode } from "../../types/snapshot";

function findTitle(nodes: ReferenceNode[], id: string | null): string {
  if (id === null) return "";
  for (const node of nodes) {
    if (node.id === id) return node.title;
    const found = findTitle(node.children, id);
    if (found) return found;
  }
  return "";
}

function nodeContains(node: ReferenceNode, id: string): boolean {
  return node.id === id || node.children.some((child) => nodeContains(child, id));
}

// A root's id is the reference file's own absolute path (see ReferenceNode),
// so the root containing a selected node IS the file to ask the backend to
// look in -- passed to useReferenceBody so it can skip scanning every other
// reference file for a match.
function findRootFile(nodes: ReferenceNode[], id: string | null): string | null {
  if (id === null) return null;
  const root = nodes.find((node) => nodeContains(node, id));
  return root?.id ?? null;
}

/** Every id in NODES that has descendants, i.e. every node search results
 * need expanded for their matching sections to be visible. Search returns
 * a tree already pruned to hits and the ancestors leading to them, so
 * expanding all of it reveals exactly the matches and nothing else. */
function expandableIds(nodes: ReferenceNode[], acc: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.children.length > 0) {
      acc.add(node.id);
      expandableIds(node.children, acc);
    }
  }
  return acc;
}

interface TreeNodeProps {
  node: ReferenceNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ReferenceTreeNode({ node, depth, expanded, onToggle, selectedId, onSelect }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  // Colors cap at level 3 -- deeper nesting reuses the level-3 color rather
  // than growing the palette indefinitely.
  const iconLevel = Math.min(depth, 3);

  return (
    <li>
      <div
        className={"k-ref-tree__row" + (isSelected ? " k-ref-tree__row--selected" : "")}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          type="button"
          className="k-ref-tree__toggle"
          onClick={() => onToggle(node.id)}
          disabled={!hasChildren}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {hasChildren && (
            <span
              className={
                "k-ref-tree__toggle-icon" + (isExpanded ? " k-ref-tree__toggle-icon--expanded" : "")
              }
              aria-hidden="true"
            >
              ▸
            </span>
          )}
        </button>
        <button
          type="button"
          className={"k-ref-tree__title" + (node.match ? " k-ref-tree__title--match" : "")}
          onClick={() => onSelect(node.id)}
        >
          {depth === 0 ? (
            <span className="k-ref-tree__file-icon" aria-hidden="true">
              📄
            </span>
          ) : (
            <span
              className={`k-ref-tree__node-icon k-ref-tree__node-icon--level-${iconLevel}`}
              aria-hidden="true"
            />
          )}
          {node.title}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul className="k-ref-tree__children">
          {node.children.map((child) => (
            <ReferenceTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function References() {
  const treeRaw = useReferenceTree();
  const fullTree = useMemo(() => treeRaw ?? [], [treeRaw]);
  const [query, setQuery] = useState("");
  const results = useReferenceSearch(query);
  const searching = query.trim() !== "";
  // While a query's first results are in flight, `results' is undefined --
  // keep showing the full list rather than flashing an empty pane. The
  // 150ms debounce makes this window short but it is not zero.
  const tree = searching && results !== undefined ? results : fullTree;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search results arrive pruned to matches and their ancestors, so
  // expanding everything in them surfaces each matching section in its real
  // outline position. Clearing the box drops back to whatever the user had
  // expanded by hand, rather than leaving all 52 docs blown open.
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (searching && results !== undefined) {
      setExpanded(expandableIds(results));
    } else if (!searching) {
      setExpanded(manualExpanded);
    }
    // `manualExpanded' is deliberately not a dependency: it changes on every
    // hand-toggle, and re-running this then would clobber search's expansion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, results]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Only remember hand-toggles made outside a search -- expansion done
      // while filtered belongs to the results, not to the full list.
      if (!searching) setManualExpanded(next);
      return next;
    });
  };

  // Selecting a node also expands it, so drilling into a file/section by
  // clicking its title works without a separate click on the toggle arrow.
  const select = (id: string) => {
    setSelectedId(id);
    setExpanded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      if (!searching) setManualExpanded(next);
      return next;
    });
  };

  // Resolved against the FULL tree, never the filtered one: a doc stays open
  // in the viewer while you type a query that no longer lists it, and the
  // backend still needs its owning file to fetch the body.
  const selectedTitle = useMemo(() => findTitle(fullTree, selectedId), [fullTree, selectedId]);
  const selectedFile = useMemo(() => findRootFile(fullTree, selectedId), [fullTree, selectedId]);
  const body = useReferenceBody(selectedId, selectedFile);

  if (treeRaw === undefined) {
    return <p className="k-ref-empty">Loading references…</p>;
  }

  if (fullTree.length === 0) {
    return (
      <p className="k-ref-empty">
        No reference documents found. Drop <code>.org</code> files into your references
        folder (<code>k-agenda-references-dir</code> in Emacs) to see them here.
      </p>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="k-references-split" className="k-ref-panels">
      <Panel defaultSize={30} minSize={18} className="k-ref-tree-panel">
        <div className="k-ref-search">
          <span className="k-ref-search__icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className="k-ref-search__input"
            placeholder="Search documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search reference documents"
          />
          {query !== "" && (
            <button
              type="button"
              className="k-ref-search__clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div className="k-ref-tree-scroll">
          {searching && tree.length === 0 ? (
            <p className="k-ref-empty">
              No documents match <strong>{query.trim()}</strong>.
            </p>
          ) : (
            <ul className="k-ref-tree k-ref-tree--root">
              {tree.map((node) => (
                <ReferenceTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  selectedId={selectedId}
                  onSelect={select}
                />
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <PanelResizeHandle className="k-ref-resize-handle" />
      <Panel defaultSize={70} minSize={30} className="k-ref-viewer-panel">
        <div className="k-ref-viewer-scroll">
          {selectedId === null ? (
            <p className="k-ref-empty">Select a document or section to read it here.</p>
          ) : (
            <article className="k-ref-viewer">
              <h2 className="k-ref-viewer__title">{selectedTitle}</h2>
              {body === undefined ? (
                <p className="k-ref-empty">Loading…</p>
              ) : body === null || body === "" ? (
                <p className="k-ref-empty">No text here.</p>
              ) : (
                <div className="k-ref-viewer__body">{renderOrgText(body)}</div>
              )}
            </article>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}
