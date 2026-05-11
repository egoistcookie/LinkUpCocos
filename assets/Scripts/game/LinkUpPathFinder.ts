/** 8 宽 × 14 高；格子值为 0/null 表示空，非 0 为类型 id（同类可消）。路径最多弯折 2 次（3 段直线），可走棋盘外一圈空白（padding）。 */

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

export class LinkUpPathFinder {
    static canConnect(
        grid: (number | null)[][],
        r1: number,
        c1: number,
        r2: number,
        c2: number,
    ): boolean {
        if (r1 === r2 && c1 === c2) return false;
        const t = grid[r1][c1];
        if (t == null || t === 0 || grid[r2][c2] !== t) return false;

        const pad = buildPadded(grid, r1, c1, r2, c2);
        const sr = r1 + 1;
        const sc = c1 + 1;
        const tr = r2 + 1;
        const tc = c2 + 1;

        type Q = {
            r: number;
            c: number;
            ldr: number;
            ldc: number;
            bends: number;
            isStart: boolean;
        };
        const queue: Q[] = [];
        const seen = new Set<string>();

        queue.push({ r: sr, c: sc, ldr: 0, ldc: 0, bends: 0, isStart: true });
        seen.add(`${sr},${sc},start`);

        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (!cur.isStart && cur.r === tr && cur.c === tc) {
                return true;
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
                const key = `${nr},${nc},${dr},${dc},${nbends}`;
                if (seen.has(key)) continue;
                seen.add(key);
                queue.push({ r: nr, c: nc, ldr: dr, ldc: dc, bends: nbends, isStart: false });
            }
        }
        return false;
    }
}
