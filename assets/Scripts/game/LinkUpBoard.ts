import { _decorator, Button, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { LinkUpPathFinder } from './LinkUpPathFinder';

const { ccclass } = _decorator;

/** 固定 14 行 × 8 列 = 112 格；14 种 × 8 张/种（每种 4 对） */
export const BOARD_ROWS = 14;
export const BOARD_COLS = 8;
export const TYPE_COUNT = 14;
/** App 上可配置的棋盘格子贴图槽位数：第 n 项对应「n 号类型」（与格子数字一致） */
export const TILE_SPRITE_SLOTS = 30;
const TILES_PER_TYPE = (BOARD_ROWS * BOARD_COLS) / TYPE_COUNT;

const COLOR_SEL = new Color(0xe9, 0xc4, 0x6a, 255);
const COLOR_HINT = new Color(0xe9, 0xc4, 0x6a, 255);
const COLOR_LINE = new Color(0xff, 0xd7, 0x4a, 230);
/** 有牌时的格子底（与棋盘底区分）；整块随节点 active 一起隐藏 */
const COLOR_CELL_FACE = new Color(0x3a, 0x4d, 0x6e, 255);

/** 扩展盘外圈映射到本地坐标时，向棋盘内侧拉拢的比例（越大越贴棋盘，越不易伸出画面外） */
const EDGE_LINE_PULL = 0.32;

@ccclass('LinkUpBoard')
export class LinkUpBoard extends Component {
    grid: (number | null)[][] = [];
    /** 每个格子根节点（含 Label/Button）；空位时 active=false */
    private _cells: (Node | null)[][] = [];
    private _sel: { r: number; c: number } | null = null;
    private _cellSize = { w: 64, h: 64 };
    private _hintCells: Array<{ r: number; c: number; oldLab: Color | null; oldSpr: Color | null }> = [];
    private _lineNode: Node | null = null;
    /** 来自 GameApp：索引 i 对应类型 id i+1 */
    private _tileFaceSprites: Array<SpriteFrame | null> = [];

    onWin: (() => void) | null = null;

    /** 由 GameApp 传入；可随时调用刷新当前棋盘显示 */
    setTileFaceSprites(frames: (SpriteFrame | null)[] | null | undefined) {
        this._tileFaceSprites = [];
        if (frames && frames.length > 0) {
            for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
                this._tileFaceSprites.push(i < frames.length ? frames[i] ?? null : null);
            }
        } else {
            for (let i = 0; i < TILE_SPRITE_SLOTS; i++) this._tileFaceSprites.push(null);
        }
        if (this._cells.length === BOARD_ROWS && this._cells[0]?.length === BOARD_COLS) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    this._syncCellVisual(r, c);
                }
            }
            this._applySelectionTint();
        }
    }

    private _spriteFrameForType(typeId: number): SpriteFrame | null {
        if (typeId < 1 || typeId > TILE_SPRITE_SLOTS) return null;
        return this._tileFaceSprites[typeId - 1] ?? null;
    }

    /** buildLevel/_spawnCells 完成前 grid 未初始化，避免工具按钮访问 undefined */
    private _layoutReady(): boolean {
        return (
            this.grid.length === BOARD_ROWS &&
            !!this.grid[0] &&
            this.grid[0].length === BOARD_COLS
        );
    }

    private _cellImg(n: Node): Sprite | null {
        return n.getChildByName('Face')?.getChildByName('Img')?.getComponent(Sprite) ?? null;
    }

    buildLevel() {
        this._clearBoard();
        this._ensureLayout();
        this._fillRandomSolvable();
    }

    private _clearBoard() {
        this.node.removeAllChildren();
        this._lineNode = null;
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

    /** Label 放在子节点上，避免与 Graphics 同节点时绘制顺序盖住文字 */
    private _lab(n: Node): Label | null {
        return n.getChildByName('Lbl')?.getComponent(Label) ?? null;
    }

    /** 按当前尺寸重画格子底色（仅数字模式：Graphics 开启时） */
    private _paintCellFace(n: Node, tw: number, th: number) {
        const face = n.getChildByName('Face');
        const g = face?.getComponent(Graphics);
        if (!g || !g.enabled) return;
        g.clear();
        g.fillColor = COLOR_CELL_FACE;
        g.fillRect(-tw / 2, -th / 2, tw, th);
    }

    /**
     * 扩展盘坐标 → Board 本地坐标（与格子中心同一套公式）。
     * 外圈一格默认落在棋盘外一整格宽处，连线容易穿出屏幕；对 pr/pc 为 0 或 最大值的一圈做点向内拉拢。
     */
    private _padToLocal(pr: number, pc: number): { x: number; y: number } {
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);
        let x = originX + (pc - 1) * cw + cw / 2;
        let y = originY - (pr - 1) * ch - ch / 2;

        const maxPr = BOARD_ROWS + 1;
        const maxPc = BOARD_COLS + 1;
        const k = EDGE_LINE_PULL;

        if (BOARD_ROWS >= 1) {
            if (pr === 0) {
                const yInner = originY - ch / 2;
                y = y + k * (yInner - y);
            } else if (pr === maxPr) {
                const yInner = originY - (BOARD_ROWS - 1) * ch - ch / 2;
                y = y + k * (yInner - y);
            }
        }
        if (BOARD_COLS >= 1) {
            if (pc === 0) {
                const xInner = originX + cw / 2;
                x = x + k * (xInner - x);
            } else if (pc === maxPc) {
                const xInner = originX + (BOARD_COLS - 1) * cw + cw / 2;
                x = x + k * (xInner - x);
            }
        }

        return { x, y };
    }

    private _ensureLineNode(): Graphics {
        if (this._lineNode && this._lineNode.isValid) {
            const g = this._lineNode.getComponent(Graphics);
            if (g) return g;
        }
        const n = new Node('ConnectLine');
        n.setParent(this.node);
        const ut = n.addComponent(UITransform);
        const ui = this.node.getComponent(UITransform);
        if (ui) ut.setContentSize(ui.width, ui.height);
        n.setPosition(0, 0, 0);
        const g = n.addComponent(Graphics);
        this._lineNode = n;
        return g;
    }

    private _clearConnectLine = () => {
        const g = this._lineNode?.getComponent(Graphics);
        g?.clear();
    };

    private _drawConnectLine(r1: number, c1: number, r2: number, c2: number) {
        const path = LinkUpPathFinder.findPath(this.grid, r1, c1, r2, c2);
        if (!path || path.length < 2) return;
        const g = this._ensureLineNode();
        g.clear();
        g.lineWidth = 5;
        g.strokeColor = COLOR_LINE;
        const p0 = this._padToLocal(path[0].r, path[0].c);
        g.moveTo(p0.x, p0.y);
        for (let i = 1; i < path.length; i++) {
            const p = this._padToLocal(path[i].r, path[i].c);
            g.lineTo(p.x, p.y);
        }
        g.stroke();
        this._lineNode!.setSiblingIndex(this.node.children.length - 1);
        this.unschedule(this._clearConnectLine);
        this.scheduleOnce(this._clearConnectLine, 0.42);
    }

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
        this._lineNode = null;
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const n = new Node(`cell_${r}_${c}`);
                n.setParent(this.node);
                const tw = cw - 2;
                const th = ch - 2;
                const ut = n.addComponent(UITransform);
                ut.setContentSize(tw, th);
                n.setPosition(originX + c * cw + cw / 2, originY - r * ch - ch / 2, 0);

                const faceN = new Node('Face');
                faceN.setParent(n);
                faceN.addComponent(UITransform).setContentSize(tw, th);
                const faceG = faceN.addComponent(Graphics);
                faceG.fillColor = COLOR_CELL_FACE;
                faceG.fillRect(-tw / 2, -th / 2, tw, th);

                const imgN = new Node('Img');
                imgN.setParent(faceN);
                imgN.addComponent(UITransform).setContentSize(tw, th);
                const tileSp = imgN.addComponent(Sprite);
                tileSp.sizeMode = Sprite.SizeMode.CUSTOM;
                tileSp.enabled = false;

                const lblN = new Node('Lbl');
                lblN.setParent(n);
                lblN.addComponent(UITransform).setContentSize(tw, th);
                lblN.setSiblingIndex(1);

                const lab = lblN.addComponent(Label);
                lab.string = String(this.grid[r][c] ?? '');
                lab.fontSize = Math.min(26, Math.floor(Math.min(cw, ch) * 0.42));
                lab.color = Color.WHITE;
                lab.horizontalAlign = Label.HorizontalAlign.CENTER;
                lab.verticalAlign = Label.VerticalAlign.CENTER;

                const btn = n.addComponent(Button);
                btn.transition = Button.Transition.NONE;
                btn.target = n;
                n.on(Button.EventType.CLICK, () => this._onCellTap(r, c), this);

                this._cells[r][c] = n;
            }
        }
        this._paintAll();
    }

    private _paintAll() {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                this._syncCellVisual(r, c);
            }
        }
        this._applySelectionTint();
    }

    private _syncCellVisual(r: number, c: number) {
        const n = this._cells[r][c];
        if (!n) return;
        const v = this.grid[r][c];
        const lab = this._lab(n);
        const face = n.getChildByName('Face');
        const g = face?.getComponent(Graphics);
        const img = this._cellImg(n);

        if (v == null) {
            const btn = n.getComponent(Button);
            if (btn) btn.interactable = false;
            n.active = false;
            if (lab) {
                lab.string = '';
                lab.color = Color.WHITE;
                lab.enabled = false;
            }
            if (img) {
                img.spriteFrame = null;
                img.enabled = false;
                img.color = Color.WHITE;
            }
            if (g) {
                g.enabled = true;
                g.clear();
            }
            return;
        }

        const btn = n.getComponent(Button);
        if (btn) btn.interactable = true;
        n.active = true;

        const ut = n.getComponent(UITransform);
        const tw = ut?.width ?? 0;
        const th = ut?.height ?? 0;
        const sf = this._spriteFrameForType(v);

        if (sf && img) {
            img.spriteFrame = sf;
            img.enabled = true;
            img.sizeMode = Sprite.SizeMode.CUSTOM;
            img.color = Color.WHITE;
            if (g) {
                g.clear();
                g.enabled = false;
            }
            if (lab) {
                lab.string = '';
                lab.color = Color.WHITE;
                lab.enabled = false;
            }
        } else {
            if (img) {
                img.spriteFrame = null;
                img.enabled = false;
                img.color = Color.WHITE;
            }
            if (g) {
                g.enabled = true;
                this._paintCellFace(n, tw, th);
            }
            if (lab) {
                lab.enabled = true;
                lab.string = String(v);
                lab.color = Color.WHITE;
            }
        }
    }

    private _applySelectionTint() {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const n = this._cells[r][c];
                if (!n || !n.active || this.grid[r][c] == null) continue;
                const v = this.grid[r][c]!;
                const lab = this._lab(n);
                const img = this._cellImg(n);
                const useImg = !!(img?.spriteFrame && this._spriteFrameForType(v));
                const sel = !!(this._sel && this._sel.r === r && this._sel.c === c);
                if (useImg && img) {
                    img.color = sel ? COLOR_SEL : Color.WHITE;
                } else if (lab) {
                    lab.color = sel ? COLOR_SEL : Color.WHITE;
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
            this._drawConnectLine(r0, c0, r, c);
            this.grid[r0][c0] = null;
            this.grid[r][c] = null;
            this._sel = null;
            this._syncCellVisual(r0, c0);
            this._syncCellVisual(r, c);
            this._afterChange();
        } else {
            this._sel = { r, c };
            this._applySelectionTint();
        }
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
        if (!this._layoutReady()) return null;
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
            const n = this._cells[r][c];
            if (!n) return;
            const lab = this._lab(n);
            const img = this._cellImg(n);
            const oldLab = lab && lab.string !== '' ? lab.color.clone() : null;
            const oldSpr =
                img && img.spriteFrame ? img.color.clone() : null;
            if (oldLab != null) lab!.color = COLOR_HINT;
            if (oldSpr != null && img) img.color = COLOR_HINT;
            if (oldLab != null || oldSpr != null) {
                this._hintCells.push({ r, c, oldLab, oldSpr });
            }
        };
        mark(p.r1, p.c1);
        mark(p.r2, p.c2);
        this.unschedule(this._clearHintVisual);
        this.scheduleOnce(this._clearHintVisual, 2);
    }

    private _clearHintVisual = () => {
        for (const h of this._hintCells) {
            const n = this._cells[h.r][h.c];
            if (!n) continue;
            const lab = this._lab(n);
            const img = this._cellImg(n);
            if (h.oldLab != null && lab) lab.color = h.oldLab;
            if (h.oldSpr != null && img && img.spriteFrame) img.color = h.oldSpr;
        }
        this._hintCells.length = 0;
        this._applySelectionTint();
    };

    shuffleAll(ensurePair: boolean) {
        if (!this._layoutReady()) return;
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
                this._syncCellVisual(r, c);
            }
        }
        this._applySelectionTint();
    }

    removeTwoRandomTiles() {
        if (!this._layoutReady()) return;
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
            this._syncCellVisual(occ[i1].r, occ[i1].c);
            this._afterChange();
            return;
        }
        const a = occ[i1];
        const b = occ[i2];
        this.grid[a.r][a.c] = null;
        this.grid[b.r][b.c] = null;
        this._syncCellVisual(a.r, a.c);
        this._syncCellVisual(b.r, b.c);
        this._sel = null;
        this._afterChange();
    }

    resizeToParent() {
        if (this._cells.length !== BOARD_ROWS || !this._cells[0] || this._cells[0].length !== BOARD_COLS) {
            return;
        }
        this._ensureLayout();
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const n = this._cells[r][c];
                if (!n) continue;
                const ut = n.getComponent(UITransform);
                if (ut) {
                    const tw = cw - 2;
                    const th = ch - 2;
                    ut.setContentSize(tw, th);
                    n.setPosition(originX + c * cw + cw / 2, originY - r * ch - ch / 2, 0);
                    n.getChildByName('Face')?.getComponent(UITransform)?.setContentSize(tw, th);
                    n.getChildByName('Face')?.getChildByName('Img')?.getComponent(UITransform)?.setContentSize(tw, th);
                    n.getChildByName('Lbl')?.getComponent(UITransform)?.setContentSize(tw, th);
                    const lab = this._lab(n);
                    if (lab) lab.fontSize = Math.min(26, Math.floor(Math.min(cw, ch) * 0.42));
                    if (n.active) this._syncCellVisual(r, c);
                }
            }
        }
        const ui = this.node.getComponent(UITransform);
        const ln = this._lineNode;
        if (ln && ui) {
            ln.getComponent(UITransform)?.setContentSize(ui.width, ui.height);
        }
    }
}
