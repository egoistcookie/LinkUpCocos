/** 扩展盘寻路：格子值为 null/0 表示空；路径最多弯折 2 次（3 段直线），可走棋盘外一圈空白（行列数以 LinkUpBoard 为准）。 */

const DIRS: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
];

function walkable(pad: number[][], r: number, c: number): boolean {
    return pad[r][c] === 0;
}

function buildPadded(
    grid: (number | null)[][],
    r1: number,
    c1: number,
    r2: number,
    c2: number,
): number[][] {
    const rows = grid.length;
    const cols = grid[0].length;
    const h = rows + 2;
    const w = cols + 2;
    const pad: number[][] = [];
    for (let i = 0; i < h; i++) {
        pad[i] = new Array(w).fill(0);
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = grid[r][c];
            pad[r + 1][c + 1] = v == null || v === 0 ? 0 : 1;
        }
    }
    pad[r1 + 1][c1 + 1] = 0;
    pad[r2 + 1][c2 + 1] = 0;
    return pad;
}

type St = {
    r: number;
    c: number;
    ldr: number;
    ldc: number;
    bends: number;
    isStart: boolean;
};

function stKey(st: St): string {
    return `${st.r},${st.c},${st.ldr},${st.ldc},${st.bends},${st.isStart ? 1 : 0}`;
}

/** 去掉共线的中间点，保留直角折点 */
function simplifyPadPath(pts: { r: number; c: number }[]): { r: number; c: number }[] {
    if (pts.length <= 2) return pts;
    const out: { r: number; c: number }[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1];
        const b = pts[i];
        const c = pts[i + 1];
        const sameRow = a.r === b.r && b.r === c.r;
        const sameCol = a.c === b.c && b.c === c.c;
        if (sameRow || sameCol) continue;
        out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
}

function runBfs(
    grid: (number | null)[][],
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    wantPath: boolean,
): { ok: boolean; end: St | null; parent: Map<string, St | null> } {
    if (r1 === r2 && c1 === c2) return { ok: false, end: null, parent: new Map() };
    const t = grid[r1][c1];
    if (t == null || t === 0 || grid[r2][c2] !== t) return { ok: false, end: null, parent: new Map() };

    const pad = buildPadded(grid, r1, c1, r2, c2);
    const sr = r1 + 1;
    const sc = c1 + 1;
    const tr = r2 + 1;
    const tc = c2 + 1;

    const queue: St[] = [];
    const seen = new Set<string>();
    const parent = new Map<string, St | null>();
    const start: St = { r: sr, c: sc, ldr: 0, ldc: 0, bends: 0, isStart: true };
    queue.push(start);
    const sk = stKey(start);
    seen.add(sk);
    if (wantPath) parent.set(sk, null);

    while (queue.length > 0) {
        const cur = queue.shift()!;
        if (!cur.isStart && cur.r === tr && cur.c === tc) {
            return { ok: true, end: cur, parent };
        }
        for (const [dr, dc] of DIRS) {
            const nr = cur.r + dr;
            const nc = cur.c + dc;
            if (nr < 0 || nc < 0 || nr >= pad.length || nc >= pad[0].length) continue;
            if (!walkable(pad, nr, nc)) continue;

            let nbends = cur.bends;
            if (!cur.isStart) {
                if (dr !== cur.ldr || dc !== cur.ldc) {
                    nbends = cur.bends + 1;
                    if (nbends > 2) continue;
                }
            }
            const nb: St = { r: nr, c: nc, ldr: dr, ldc: dc, bends: nbends, isStart: false };
            const k = stKey(nb);
            if (seen.has(k)) continue;
            seen.add(k);
            if (wantPath) parent.set(k, cur);
            queue.push(nb);
        }
    }
    return { ok: false, end: null, parent };
}

export class LinkUpPathFinder {
    static canConnect(
        grid: (number | null)[][],
        r1: number,
        c1: number,
        r2: number,
        c2: number,
    ): boolean {
        return runBfs(grid, r1, c1, r2, c2, false).ok;
    }

    /** 返回扩展盘坐标系下的路径点（含弯折），不可连时 null */
    static findPath(
        grid: (number | null)[][],
        r1: number,
        c1: number,
        r2: number,
        c2: number,
    ): { r: number; c: number }[] | null {
        const { ok, end, parent } = runBfs(grid, r1, c1, r2, c2, true);
        if (!ok || !end) return null;
        const raw: { r: number; c: number }[] = [];
        let w: St | null = end;
        while (w) {
            raw.push({ r: w.r, c: w.c });
            w = parent.get(stKey(w)) ?? null;
        }
        raw.reverse();
        return simplifyPadPath(raw);
    }
}
