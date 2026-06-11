/**
 * ThreadingTreePopout — visual tree view of thread message hierarchy (#25 plan v1.0).
 */

import React from 'react';
import { ThreadTree, ThreadTreeNode } from './konar-algorithm';

const { localized } = require('actunamail-exports');

interface Props {
  tree?: ThreadTree;
}

function renderNode(node: ThreadTreeNode, depth: number): React.ReactNode {
  return (
    <li key={node.messageId} className="threading-tree-node" style={{ marginLeft: depth * 16 }}>
      <span className="threading-tree-from">{node.from}</span>
      <span className="threading-tree-subject">{node.subject || '(no subject)'}</span>
      {node.children && node.children.length > 0 && (
        <ul className="threading-tree-children">
          {node.children.map((c) => renderNode(c, depth + 1))}
        </ul>
      )}
    </li>
  );
}

export default class ThreadingTreePopout extends React.Component<Props> {
  static displayName = 'ThreadingTreePopout';
  static containerRequired = false;

  render() {
    const tree = this.props.tree;
    if (!tree || !tree.roots || tree.roots.length === 0) return null;
    return (
      <div
        className="threading-tree-popout"
        role="region"
        aria-label={localized('Drzewo wątku / Thread tree')}
      >
        <ul className="threading-tree-roots">{tree.roots.map((r) => renderNode(r, 0))}</ul>
      </div>
    );
  }
}
