import { _decorator, Button, Color, Component, Label, Node, UITransform } from 'cc';
import { LinkUpPathFinder } from './LinkUpPathFinder';

const { ccclass } = _decorator;

export const BOARD_ROWS = 14;
export const BOARD_COLS = 8;
const TYPE_COUNT = 14;
const TILES_PER_TYPE = (BOARD_ROWS * BOARD_COLS) / TYPE_COUNT;

const COLOR_SEL = new Color(0xe9, 0xc4, 0x6a, 255);
const COLOR_HINT = new Color(0xe9, 0xc4, 0x6a, 255);

@ccclass('LinkUpBoard')
export class LinkUpBoard extends Component {
    grid: (number | null)[][] = [];
    private _cells: (Label | null)[][] = [];
    private _sel: { r: number; c: number } | null = null;
    private _cellSize = { w: 64, h: 64 };
    private _hintCells: Array<{ r: number; c: number; old: Color }> = [];

    onWin: (() => void) | null = null;

    buildLevel() {
        this._clearBoard();
        this._ensureLayout();
        this._fillRandomSolvable();
    }

    private _clearBoard() {
        this.node.removeAllChildren();
        this.grid = [];
        this._cells = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            this.grid[r] = [];
            this._cells[r] = [];
            for (let c = 0; c < BOARD_COLS; c++) {
                this.grid[r][c] = null;
                this._cells[r][c] = null;
            }
        }
    }

    private _ensureLayout() {
        const ui = this.node.getComponent(UITransform);
        if (!ui) return;
        const { width, height } = ui;
        this._cellSize.w = Math.floor(width / BOARD_COLS);
        this._cellSize.h = Math.floor(height / BOARD_ROWS);
    }

    /** 随机填充满且保证至少一对可连；必要时重洗 */
    private _fillRandomSolvable() {
        const maxTry = 80;
        for (let t = 0; t < maxTry; t++) {
            const bag: number[] = [];
            for (let k = 1; k <= TYPE_COUNT; k++) {
                for (let i = 0; i < TILES_PER_TYPE; i++) bag.push(k);
            }
            this._shuffle(bag);
            let i = 0;
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    this.grid[r][c] = bag[i++];
                }
            }
            if (this.findHintPair() != null) {
                this._spawnCells();
                return;
            }
        }
        // 极端 fallback：仍渲染，避免卡死
        this._spawnCells();
    }

    private _shuffle<T>(arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private _spawnCells() {
        this.node.removeAllChildren();
        const ui = this.node.getComponent(UITransform);
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const n = new Node(`cell_${r}_${c}`);
                n.setParent(this.node);
                const ut = n.addComponent(UITransform);
                ut.setContentSize(cw - 2, ch - 2);
                n.setPosition(originX + c * cw + cw / 2, originY - r * ch - ch / 2, 0);

                const lab = n.addComponent(Label);
                lab.string = String(this.grid[r][c] ?? '');
                lab.fontSize = Math.min(28, Math.floor(Math.min(cw, ch) * 0.45));
                lab.color = Color.WHITE;
                lab.horizontalAlign = Label.HorizontalAlign.CENTER;
                lab.verticalAlign = Label.VerticalAlign.CENTER;

                const btn = n.addComponent(Button);
                btn.transition = Button.Transition.NONE;
                btn.target = n;
                n.on(Button.EventType.CLICK, () => this._onCellTap(r, c), this);

                this._cells[r][c] = lab;
            }
        }
        this._paintAll();
    }

    private _paintAll() {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const lab = this._cells[r][c];
                if (!lab) continue;
                const v = this.grid[r][c];
                lab.string = v == null ? '' : String(v);
                lab.color = Color.WHITE;
            }
        }
        this._applySelectionTint();
    }

    private _applySelectionTint() {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const lab = this._cells[r][c];
                if (!lab || this.grid[r][c] == null) continue;
                if (this._sel && this._sel.r === r && this._sel.c === c) {
                    lab.color = COLOR_SEL;
                } else {
                    lab.color = Color.WHITE;
                }
            }
        }
    }

    private _onCellTap(r: number, c: number) {
        const v = this.grid[r][c];
        if (v == null) return;

        if (!this._sel) {
            this._sel = { r, c };
            this._applySelectionTint();
            return;
        }
        if (this._sel.r === r && this._sel.c === c) {
            this._sel = null;
            this._applySelectionTint();
            return;
        }
        const r0 = this._sel.r;
        const c0 = this._sel.c;
        const v0 = this.grid[r0][c0];
        if (v0 !== v) {
            this._sel = { r, c };
            this._applySelectionTint();
            return;
        }
        if (LinkUpPathFinder.canConnect(this.grid, r0, c0, r, c)) {
            this.grid[r0][c0] = null;
            this.grid[r][c] = null;
            this._sel = null;
            this._syncCellLabels(r0, c0);
            this._syncCellLabels(r, c);
            this._afterChange();
        } else {
            this._sel = { r, c };
            this._applySelectionTint();
        }
    }

    private _syncCellLabels(r: number, c: number) {
        const lab = this._cells[r][c];
        if (!lab) return;
        const v = this.grid[r][c];
        lab.string = v == null ? '' : String(v);
        lab.color = Color.WHITE;
    }

    private _isEmpty(): boolean {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this.grid[r][c] != null) return false;
            }
        }
        return true;
    }

    private _afterChange() {
        if (this._isEmpty()) {
            this.onWin?.();
            return;
        }
        if (!this.hasAnyConnectablePair()) {
            this.shuffleAll(true);
        }
    }

    hasAnyConnectablePair(): boolean {
        return this.findHintPair() != null;
    }

    findHintPair(): { r1: number; c1: number; r2: number; c2: number } | null {
        for (let r1 = 0; r1 < BOARD_ROWS; r1++) {
            for (let c1 = 0; c1 < BOARD_COLS; c1++) {
                const a = this.grid[r1][c1];
                if (a == null) continue;
                for (let r2 = 0; r2 < BOARD_ROWS; r2++) {
                    for (let c2 = 0; c2 < BOARD_COLS; c2++) {
                        if (r1 === r2 && c1 === c2) continue;
                        const b = this.grid[r2][c2];
                        if (b !== a) continue;
                        if (LinkUpPathFinder.canConnect(this.grid, r1, c1, r2, c2)) {
                            return { r1, c1, r2, c2 };
                        }
                    }
                }
            }
        }
        return null;
    }

    showHint() {
        const p = this.findHintPair();
        if (!p) return;
        this._clearHintVisual();
        const mark = (r: number, c: number) => {
            const lab = this._cells[r][c];
            if (!lab) return;
            this._hintCells.push({ r, c, old: lab.color.clone() });
            lab.color = COLOR_HINT;
        };
        mark(p.r1, p.c1);
        mark(p.r2, p.c2);
        this.unschedule(this._clearHintVisual);
        this.scheduleOnce(this._clearHintVisual, 2);
    }

    private _clearHintVisual = () => {
        for (const h of this._hintCells) {
            const lab = this._cells[h.r][h.c];
            if (lab) lab.color = h.old;
        }
        this._hintCells.length = 0;
    };

    /** 重排场上剩余牌；ensurePair 为 true 时保证至少一对可连 */
    shuffleAll(ensurePair: boolean) {
        const bag: number[] = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const v = this.grid[r][c];
                if (v != null) bag.push(v);
            }
        }
        if (bag.length === 0) return;

        const maxTry = ensurePair ? 120 : 1;
        for (let t = 0; t < maxTry; t++) {
            this._shuffle(bag);
            let i = 0;
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    if (this.grid[r][c] != null) {
                        this.grid[r][c] = bag[i++];
                    }
                }
            }
            if (!ensurePair || this.hasAnyConnectablePair()) {
                break;
            }
        }
        this._sel = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                this._syncCellLabels(r, c);
            }
        }
        this._applySelectionTint();
    }

    /** 随机消除两个仍有牌的格子（不必同类） */
    removeTwoRandomTiles() {
        const occ: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this.grid[r][c] != null) occ.push({ r, c });
            }
        }
        if (occ.length === 0) return;
        const i1 = Math.floor(Math.random() * occ.length);
        let i2 = Math.floor(Math.random() * occ.length);
        if (occ.length >= 2) {
            while (i2 === i1) i2 = Math.floor(Math.random() * occ.length);
        } else {
            this.grid[occ[i1].r][occ[i1].c] = null;
            this._syncCellLabels(occ[i1].r, occ[i1].c);
            this._afterChange();
            return;
        }
        const a = occ[i1];
        const b = occ[i2];
        this.grid[a.r][a.c] = null;
        this.grid[b.r][b.c] = null;
        this._syncCellLabels(a.r, a.c);
        this._syncCellLabels(b.r, b.c);
        this._sel = null;
        this._afterChange();
    }

    resizeToParent() {
        this._ensureLayout();
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const lab = this._cells[r][c];
                if (!lab) continue;
                const n = lab.node;
                const ut = n.getComponent(UITransform);
                if (ut) {
                    ut.setContentSize(cw - 2, ch - 2);
                    n.setPosition(originX + c * cw + cw / 2, originY - r * ch - ch / 2, 0);
                }
            }
        }
    }
}
