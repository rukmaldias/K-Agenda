import { useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useReferenceBody, useSnapshot } from "../../lib/ws";
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
        <button type="button" className="k-ref-tree__title" onClick={() => onSelect(node.id)}>
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
  const snapshot = useSnapshot();
  const tree = useMemo(() => snapshot?.referenceTree ?? [], [snapshot]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selecting a node also expands it, so drilling into a file/section by
  // clicking its title works without a separate click on the toggle arrow.
  const select = (id: string) => {
    setSelectedId(id);
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  const selectedTitle = useMemo(() => findTitle(tree, selectedId), [tree, selectedId]);
  const body = useReferenceBody(selectedId);

  if (!snapshot) {
    return <p className="k-ref-empty">Connecting…</p>;
  }

  if (tree.length === 0) {
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
      </Panel>
      <PanelResizeHandle className="k-ref-resize-handle" />
      <Panel defaultSize={70} minSize={30} className="k-ref-viewer-panel">
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
      </Panel>
    </PanelGroup>
  );
}
