/**
 * Konar (branch) detection algorithm — bilet MVP #97.
 *
 * Wzór: budowa drzewa wątku z headers In-Reply-To + References,
 * z fallback do Subject normalization gdy headers brakuje.
 *
 * Input: lista MessageNode (id, inReplyTo, references[], subject, date, fromMe).
 * Output: drzewo z root + sub-konary, każdy konar oznaczony [OSTATNI] flag
 * na najnowszej wiadomości w gałęzi.
 *
 * Mockup: design/mockups/09-threading-popout.html.
 *
 * Algorytm:
 *   1. Index messages by Message-Id.
 *   2. Dla każdego message: parent = lookup(inReplyTo) lub last(references).
 *   3. Jeśli parent nie znaleziony → próba Subject match (normalize: usuń Re:/Fw:/Fwd:).
 *   4. Jeśli nadal nie → root (orphan / pierwszy mail w wątku).
 *   5. Konary = każde "branching point" gdzie node ma ≥2 children.
 *   6. [OSTATNI] flag: w każdej konaru leaves/sublines, mark najnowszy.
 *
 * Performance: O(n²) worst case dla Subject fallback, O(n) typical (z headers).
 */

export interface MessageNode {
  id: string;                  // Message-Id
  inReplyTo?: string;          // In-Reply-To header
  references?: string[];       // References header (parsed)
  subject?: string;
  date: number;                // Unix ms
  fromMe?: boolean;            // user is sender (different visualization)
  from?: string;               // sender email
}

export interface ThreadTreeNode {
  message: MessageNode;
  children: ThreadTreeNode[];
  /** Identyfikator konaru — dla colorowania w popout. */
  konarId: number;
  /** True dla najnowszej wiadomości w tym konaru (badge). */
  isLatestInKonar: boolean;
  depth: number;
}

export interface ThreadTree {
  roots: ThreadTreeNode[];
  konarCount: number;
  totalMessages: number;
}

/** Normalize subject — strip Re:/Fw:/Fwd:/RE: itp. */
export function normalizeSubject(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/^(re|fw|fwd|odp|pd|dw):\s*/gi, '')
    .replace(/^(re|fw|fwd|odp|pd|dw):\s*/gi, '') // double prefix
    .replace(/^(re|fw|fwd|odp|pd|dw):\s*/gi, '') // triple
    .trim()
    .toLowerCase();
}

export function buildThreadTree(messages: MessageNode[]): ThreadTree {
  if (!messages || messages.length === 0) {
    return { roots: [], konarCount: 0, totalMessages: 0 };
  }

  // Index by id
  const byId = new Map<string, MessageNode>();
  for (const m of messages) {
    if (m.id) byId.set(m.id, m);
  }

  // Subject index dla fallback
  const bySubject = new Map<string, MessageNode[]>();
  for (const m of messages) {
    const subj = normalizeSubject(m.subject);
    if (!subj) continue;
    if (!bySubject.has(subj)) bySubject.set(subj, []);
    bySubject.get(subj)!.push(m);
  }

  // Build parent links
  const parentOf = new Map<string, string | null>();
  for (const m of messages) {
    if (!m.id) continue;
    let parent: string | null = null;

    // 1. In-Reply-To
    if (m.inReplyTo && byId.has(m.inReplyTo)) {
      parent = m.inReplyTo;
    } else if (m.references && m.references.length > 0) {
      // 2. Last References entry that exists in our set
      for (let i = m.references.length - 1; i >= 0; i--) {
        if (byId.has(m.references[i])) {
          parent = m.references[i];
          break;
        }
      }
    }

    // 3. Subject fallback — find oldest message w samej subject (NIE self)
    if (!parent) {
      const subj = normalizeSubject(m.subject);
      if (subj) {
        const candidates = bySubject.get(subj) || [];
        const olderSameSubject = candidates
          .filter(c => c.id !== m.id && c.date < m.date)
          .sort((a, b) => a.date - b.date);
        if (olderSameSubject.length > 0) {
          parent = olderSameSubject[0].id;
        }
      }
    }

    parentOf.set(m.id, parent);
  }

  // Build children index
  const childrenOf = new Map<string | null, MessageNode[]>();
  for (const m of messages) {
    if (!m.id) continue;
    const p = parentOf.get(m.id) ?? null;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p)!.push(m);
  }

  // Sort children chronologically
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.date - b.date);
  }

  // Build tree recursively, assigning konar IDs
  let nextKonarId = 0;
  const rootMessages = childrenOf.get(null) || [];

  function buildNode(msg: MessageNode, depth: number, konarId: number): ThreadTreeNode {
    const children = childrenOf.get(msg.id) || [];
    const node: ThreadTreeNode = {
      message: msg,
      children: [],
      konarId,
      isLatestInKonar: false, // ustawione później
      depth,
    };
    // Pierwsze child kontynuuje konar; dodatkowe dzieci tworzą nowe konary
    for (let i = 0; i < children.length; i++) {
      const childKonar = (i === 0) ? konarId : (++nextKonarId);
      node.children.push(buildNode(children[i], depth + 1, childKonar));
    }
    return node;
  }

  const rootNodes: ThreadTreeNode[] = [];
  for (const root of rootMessages) {
    rootNodes.push(buildNode(root, 0, nextKonarId++));
  }

  // Mark [OSTATNI] — najnowszy node per konarId
  const newestPerKonar = new Map<number, ThreadTreeNode>();
  function walkForLatest(node: ThreadTreeNode) {
    const cur = newestPerKonar.get(node.konarId);
    if (!cur || node.message.date > cur.message.date) {
      newestPerKonar.set(node.konarId, node);
    }
    for (const c of node.children) walkForLatest(c);
  }
  for (const root of rootNodes) walkForLatest(root);
  for (const node of newestPerKonar.values()) {
    node.isLatestInKonar = true;
  }

  return {
    roots: rootNodes,
    konarCount: nextKonarId,
    totalMessages: messages.length,
  };
}

/** Flatten tree → message list w chronological order (timeline view). */
export function flattenTree(tree: ThreadTree): ThreadTreeNode[] {
  const result: ThreadTreeNode[] = [];
  function walk(node: ThreadTreeNode) {
    result.push(node);
    for (const c of node.children) walk(c);
  }
  for (const root of tree.roots) walk(root);
  return result.sort((a, b) => a.message.date - b.message.date);
}

/** Find next/prev message w timeline order. */
export function navigateMessage(
  tree: ThreadTree,
  currentId: string,
  direction: 'next' | 'prev'
): ThreadTreeNode | null {
  const flat = flattenTree(tree);
  const idx = flat.findIndex(n => n.message.id === currentId);
  if (idx === -1) return null;
  if (direction === 'next' && idx < flat.length - 1) return flat[idx + 1];
  if (direction === 'prev' && idx > 0) return flat[idx - 1];
  return null;
}

/** Find next/prev konar (different konarId). */
export function navigateKonar(
  tree: ThreadTree,
  currentId: string,
  direction: 'next' | 'prev'
): ThreadTreeNode | null {
  const flat = flattenTree(tree);
  const idx = flat.findIndex(n => n.message.id === currentId);
  if (idx === -1) return null;
  const currentKonar = flat[idx].konarId;
  if (direction === 'next') {
    for (let i = idx + 1; i < flat.length; i++) {
      if (flat[i].konarId !== currentKonar) return flat[i];
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (flat[i].konarId !== currentKonar) return flat[i];
    }
  }
  return null;
}
