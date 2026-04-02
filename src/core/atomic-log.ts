// src/core/atomic-log.ts

export interface LogEntry {
  id: string;
  timestamp: number;
  type: string;
  data: any;
  parent?: string;
  children?: string[];
  tags: string[];
  version: number;
}

export interface Log {
  id: string;
  entries: LogEntry[];
  head: string;
  created: number;
  updated: number;
  metadata: Record<string, string>;
}

export interface LogQuery {
  type?: string;
  tags?: string[];
  from?: number;
  to?: number;
  parent?: string;
  limit?: number;
  reverse?: boolean;
}

export type MergeStrategy = 'latest-wins' | 'union' | 'custom';

const TOMBSTONE = '@@TOMBSTONE@@';

function generateId(): string {
  const time = Date.now().toString(36).padStart(10, '0');
  const rand = Math.random().toString(36).substring(2, 10);
  return `${time}-${rand}`;
}

export class AtomicLog {
  private logs: Map<string, Log> = new Map();

  create(id?: string): Log {
    const logId = id ?? generateId();
    const now = Date.now();
    const log: Log = {
      id: logId,
      entries: [],
      head: '',
      created: now,
      updated: now,
      metadata: {}
    };
    this.logs.set(logId, log);
    return log;
  }

  private getLog(logId: string): Log {
    const log = this.logs.get(logId);
    if (!log) throw new Error(`Log not found: ${logId}`);
    return log;
  }

  append(logId: string, type: string, data: any, tags: string[] = [], parent?: string): LogEntry {
    const log = this.getLog(logId);
    const id = generateId();
    
    if (parent) {
      const parentEntry = log.entries.find(e => e.id === parent);
      if (parentEntry) {
        parentEntry.children = [...(parentEntry.children || []), id];
      }
    }

    const entry: LogEntry = {
      id,
      timestamp: Date.now(),
      type,
      data,
      parent,
      children: [],
      tags,
      version: 1
    };

    log.entries.push(entry);
    log.head = id;
    log.updated = Date.now();
    return entry;
  }

  get(logId: string, entryId: string): LogEntry {
    const log = this.getLog(logId);
    const entry = log.entries.find(e => e.id === entryId);
    if (!entry) throw new Error(`Entry not found: ${entryId}`);
    return entry;
  }

  query(logId: string, q: LogQuery): LogEntry[] {
    const log = this.getLog(logId);
    let result = log.entries.filter(e => {
      if (q.type && e.type !== q.type) return false;
      if (q.tags && q.tags.length && !q.tags.every(t => e.tags.includes(t))) return false;
      if (q.from && e.timestamp < q.from) return false;
      if (q.to && e.timestamp > q.to) return false;
      if (q.parent && e.parent !== q.parent) return false;
      return e.data !== TOMBSTONE;
    });

    if (q.reverse) result.reverse();
    if (q.limit) result = result.slice(0, q.limit);
    return result;
  }

  update(logId: string, entryId: string, data: any): LogEntry {
    const log = this.getLog(logId);
    const old = this.get(logId, entryId);
    return this.append(logId, old.type, data, old.tags, old.id);
  }

  delete(logId: string, entryId: string): void {
    this.append(logId, 'tombstone', TOMBSTONE, [], entryId);
  }

  getChildren(logId: string, entryId: string): LogEntry[] {
    const entry = this.get(logId, entryId);
    if (!entry.children || entry.children.length === 0) return [];
    return entry.children.map(id => this.get(logId, id));
  }

  getPath(logId: string, entryId: string): LogEntry[] {
    const path: LogEntry[] = [];
    let current = this.get(logId, entryId);
    
    while (current) {
      path.unshift(current);
      if (!current.parent) break;
      current = this.get(logId, current.parent);
    }
    
    return path;
  }

  getBranch(logId: string, entryId: string): LogEntry[] {
    const branch: LogEntry[] = [this.get(logId, entryId)];
    let queue = [...branch];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = this.getChildren(logId, current.id);
      for (const child of children) {
        branch.push(child);
        queue.push(child);
      }
    }

    return branch;
  }

  merge(logIdA: string, logIdB: string, strategy: MergeStrategy = 'latest-wins'): Log {
    const logA = this.getLog(logIdA);
    const logB = this.getLog(logIdB);
    const merged = this.create(`${logA.id}+${logB.id}`);

    const index = new Map<string, LogEntry>();
    
    if (strategy === 'latest-wins') {
      logA.entries.forEach(e => index.set(e.id, e));
      logB.entries.forEach(e => index.set(e.id, e));
      
      const sorted = Array.from(index.values()).sort((a, b) => a.timestamp - b.timestamp);
      for (const entry of sorted) {
        this.append(merged.id, entry.type, entry.data, entry.tags, entry.parent);
      }
    } else if (strategy === 'union') {
      const seen = new Set<string>();
      [...logA.entries, ...logB.entries].forEach(e => {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          this.append(merged.id, e.type, e.data, entry.tags);
        }
      });
    } else {
      // Custom strategy placeholder
      throw new Error('Custom merge strategy requires overriding the merge method.');
    }

    merged.updated = Date.now();
    return merged;
  }

  diff(logIdA: string, logIdB: string): { added: LogEntry[]; removed: LogEntry[]; changed: LogEntry[] } {
    const logA = this.getLog(logIdA);
    const logB = this.getLog(logIdB);
    
    const mapA = new Map(logA.entries.map(e => [e.id, e]));
    const mapB = new Map(logB.entries.map(e => [e.id, e]));

    const added: LogEntry[] = [];
    const removed: LogEntry[] = [];
    const changed: LogEntry[] = [];

    for (const [id, entry] of mapB) {
      if (!mapA.has(id)) added.push(entry);
      else if (JSON.stringify(mapA.get(id)?.data) !== JSON.stringify(entry.data)) changed.push(entry);
    }

    for (const [id, entry] of mapA) {
      if (!mapB.has(id)) removed.push(entry);
    }

    return { added, removed, changed };
  }

  serialize(logId: string): string {
    return JSON.stringify(this.getLog(logId), null, 2);
  }

  deserialize(json: string): Log {
    const log = JSON.parse(json) as Log;
    this.logs.set(log.id, log);
    return log;
  }

  getStats(logId: string) {
    const log = this.getLog(logId);
    const types = new Set<string>();
    const tags = new Set<string>();
    let maxDepth = 0;

    log.entries.forEach(e => {
      types.add(e.type);
      e.tags.forEach(t => tags.add(t));
      const depth = this.getPath(logId, e.id).length;
      if (depth > maxDepth) maxDepth = depth;
    });

    const branches = log.entries.filter(e => e.children && e.children.length > 1).length;

    return {
      entries: log.entries.length,
      types: types.size,
      tags: tags.size,
      depth: maxDepth,
      branches
    };
  }

  exportMarkdown(logId: string): string {
    const log = this.getLog(logId);
    const entries = this.query(logId, { reverse: true });
    
    let md = `# Log: ${log.id}\n\n`;
    md += `> Created: ${new Date(log.created).toISOString()}\n`;
    md += `> Updated: ${new Date(log.updated).toISOString()}\n\n`;

    const roots = entries.filter(e => !e.parent);
    const buildTree = (entry: LogEntry, indent: number = 0): void => {
      const prefix = '  '.repeat(indent) + (indent > 0 ? '- ' : '## ');
      md += `${prefix}[${entry.type}] ${JSON.stringify(entry.data)} _(${entry.tags.join(', ')})_\n`;
      
      const children = this.getChildren(logId, entry.id);
      children.forEach(child => buildTree(child, indent + 1));
    };

    roots.forEach(root => buildTree(root, 0));
    return md;
  }
}