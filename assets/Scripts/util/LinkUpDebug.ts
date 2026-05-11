import { Node } from 'cc';

/** 浏览器控制台过滤关键字：`[LinkUp]` */

const P = '[LinkUp]';

export function linkLog(tag: string, ...args: unknown[]) {
    console.log(`${P} ${tag}`, ...args);
}

export function linkWarn(tag: string, ...args: unknown[]) {
    console.warn(`${P} ${tag}`, ...args);
}

/** 从节点向上拼路径，便于对照层级 */
export function nodePath(n: Node | null, maxDepth = 12): string {
    if (!n) return '(null)';
    const parts: string[] = [];
    let cur: Node | null = n;
    let d = 0;
    while (cur && d < maxDepth) {
        parts.unshift(cur.name);
        cur = cur.parent;
        d++;
    }
    return parts.join('/') || '(null)';
}
