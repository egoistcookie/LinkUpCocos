import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    UIOpacity,
    Vec2,
    Vec3,
    easing,
    math,
    resources,
    tween,
    Tween,
} from 'cc';
import { LinkUpPathFinder } from './LinkUpPathFinder';
import { MIN_DECK_TYPE_COUNT } from '../util/DeckSelectionStorage';
import { linkWarn } from '../util/LinkUpDebug';

const { ccclass } = _decorator;

/** 固定 14 行 × 8 列 = 112 格；卡组最多 40 种类型（每种偶数张，总和 112，见 _buildFullLevelBag） */
export const BOARD_ROWS = 14;
export const BOARD_COLS = 8;
export const TYPE_COUNT = 40;
/** App 上可配置的棋盘格子贴图槽位数：第 n 项对应「n 号类型」（与格子数字一致） */
export const TILE_SPRITE_SLOTS = 40;

/** 进入关卡时的机制说明（第 1 关无；未配置的关卡返回 null） */
export function getLevelEnterTip(level: number): string | null {
    switch (Math.max(1, Math.floor(level))) {
        case 2:
            return '方块消除后，同行剩余方块会向左靠齐';
        case 3:
            return '方块消除后，同行剩余方块会向右靠齐';
        case 4:
            return '方块消除后，同列剩余方块会向上靠齐';
        case 5:
            return '方块消除后，同列剩余方块会向下靠齐';
        default:
            return null;
    }
}

const COLOR_SEL = new Color(0xe9, 0xc4, 0x6a, 255);
const COLOR_HINT = new Color(0xe9, 0xc4, 0x6a, 255);
/** 金线仅显示该时长后擦除；星星动画仍用 STAR_BURST_DURATION */
const CONNECT_LINE_VISIBLE = 0.5;
/** 星星散开 + 渐隐时长（与原先一致） */
const STAR_BURST_DURATION = 0.9;
/** 星星数量 */
const STAR_BURST_COUNT = 15;
const STAR_SIZE_MIN = 5;
const STAR_SIZE_MAX = 15;
const STAR_PATH_RES = 'icon/star';
/** 有牌时的格子底（与棋盘底区分）；整块随节点 active 一起隐藏 */
const COLOR_CELL_FACE = new Color(0x3a, 0x4d, 0x6e, 255);

/** 发牌：逐格间隔（秒）；单格落子动画时长 */
const DEAL_INTERVAL = 0.014;
const DEAL_DROP_DURATION = 0.07;
/** 选中：瞬时放大再缩回 */
const SELECT_PULSE_SCALE = 1.06;
const SELECT_PULSE_UP = 0.05;
const SELECT_PULSE_DOWN = 0.07;
/** 同类型但无法连线：轻微左右晃 */
const SHAKE_OFFSET = 5;
const SHAKE_STEP = 0.035;
/** 双击同一格判定间隔（毫秒） */
const DOUBLE_CLICK_MS = 300;
/** 第 2–5 关消除后方块靠齐动画时长（略慢 + backOut 轻微回弹） */
const GRAVITY_MOVE_DURATION = 0.32;

type GravityDir = 'left' | 'right' | 'up' | 'down';
type GravityMove = { fromR: number; fromC: number; toR: number; toC: number };

/** 扩展盘外圈映射到本地坐标时，向棋盘内侧拉拢的比例（越大越贴棋盘，越不易伸出画面外） */
const EDGE_LINE_PULL = 0.32;

@ccclass('LinkUpBoard')
export class LinkUpBoard extends Component {
    grid: (number | null)[][] = [];
    /** 每个格子根节点（含 Label/Button）；空位时 active=false */
    private _cells: (Node | null)[][] = [];
    private _sel: { r: number; c: number } | null = null;
    private _lastTap: { r: number; c: number; time: number } | null = null;
    private _cellSize = { w: 64, h: 64 };
    private _hintCells: Array<{ r: number; c: number; oldLab: Color | null; oldSpr: Color | null }> = [];
    private _lineNode: Node | null = null;
    /** 连线星星挂在独立节点，避免金线 0.5s 清除时把星星一并删掉 */
    private _starBurstRoot: Node | null = null;
    private _scheduledHideLine: (() => void) | null = null;
    private _scheduledFinishLine: (() => void) | null = null;
    /** 来自 GameApp：索引 i 对应类型 id i+1 */
    private _tileFaceSprites: Array<SpriteFrame | null> = [];
    /** `undefined` 未拉取；`null` 失败 */
    private _starSpriteFrame: SpriteFrame | null | undefined = undefined;
    private _starSpriteFramePromise: Promise<SpriteFrame | null> | null = null;
    /** 连线/星星特效代数，清除或新开一局时递增，用于丢弃过期的异步加载回调 */
    private _connectLineFxGeneration = 0;
    /** 当前局用于发牌的类型 id 列表（有贴图的槽位）；为空表示使用 1…TYPE_COUNT 且允许数字显示 */
    private _activeTypeIds: number[] = [];
    /** 已配置贴图种类数 &lt; TILE_SPRITE_SLOTS：不显示数字，盘面只出现已配置类型 */
    private _spritesOnlyMode = false;

    /** 本关累计成功连线次数（通关时用于金币奖励） */
    private _levelConnectCount = 0;
    /** 当前关卡（由 GameView 在 buildLevel 前注入） */
    private _level = 1;
    private _gravityAnimGen = 0;

    onWin: ((connectCount: number) => void) | null = null;
    /** 成功连线并消除一对时，由 GameView 注入以播放音效 */
    onConnectSfx: (() => void) | null = null;
    /** 选中方块时，由 GameView 注入以播放音效 */
    onSelectSfx: (() => void) | null = null;
    /** 场上无可连对时由 GameView 弹提示并刷新；未注入则直接 shuffleAll */
    onNoConnectablePair: (() => void) | null = null;
    /** 动态发牌全部落子完成后 */
    onDealComplete: (() => void) | null = null;

    private _dealing = false;
    private _dealOrder: Array<{ r: number; c: number }> = [];
    private _dealIndex = 0;
    /** 每次 _stopDealing 递增，用于丢弃被中断的发牌 update */
    private _dealSessionId = 0;
    private _activeDealId = 0;
    private _dealAccum = 0;
    private _dealFinishWait = 0;
    private _dealPhase: 'spawning' | 'finishing' | null = null;

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
        this._recomputeActiveTypeIdsFromSprites();
        if (this._cells.length === BOARD_ROWS && this._cells[0]?.length === BOARD_COLS) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    this._syncCellVisual(r, c);
                }
            }
            this._applySelectionTint();
        }
    }

    /**
     * 卡组子集：仅使用 `typeIds` 中已有贴图的类型；至少 {@link MIN_DECK_TYPE_COUNT} 种，否则回退为「全部已配置类型」。
     * 传 `null` 或空数组表示取消卡组筛选（与当前贴图配置一致）。
     */
    setDeckTypeIds(typeIds: number[] | null) {
        if (!typeIds || typeIds.length === 0) {
            this._recomputeActiveTypeIdsFromSprites();
        } else {
            const allowed = new Set<number>();
            for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
                if (this._tileFaceSprites[i] != null) allowed.add(i + 1);
            }
            const filtered = [...new Set(typeIds.map((n) => Number(n)).filter((id) => allowed.has(id)))].sort(
                (a, b) => a - b,
            );
            if (filtered.length < MIN_DECK_TYPE_COUNT) {
                linkWarn('LinkUpBoard.setDeckTypeIds', '类型数不足，已回退为全部已配置类型', {
                    got: filtered.length,
                    min: MIN_DECK_TYPE_COUNT,
                });
                this._recomputeActiveTypeIdsFromSprites();
            } else {
                this._activeTypeIds = filtered;
                this._spritesOnlyMode = true;
            }
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

    private _recomputeActiveTypeIdsFromSprites() {
        const configured: number[] = [];
        for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
            if (this._tileFaceSprites[i] != null) configured.push(i + 1);
        }
        if (configured.length === 0) {
            this._activeTypeIds = [];
            this._spritesOnlyMode = false;
        } else if (configured.length < TILE_SPRITE_SLOTS) {
            this._activeTypeIds = configured;
            this._spritesOnlyMode = true;
        } else {
            this._activeTypeIds = configured;
            this._spritesOnlyMode = true;
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

    setLevel(level: number) {
        this._level = Math.max(1, Math.floor(level));
    }

    getLevel(): number {
        return this._level;
    }

    buildLevel() {
        this._levelConnectCount = 0;
        this._clearBoard();
        this._ensureLayout();
        this._fillRandomSolvable();
    }

    getLevelConnectCount(): number {
        return this._levelConnectCount;
    }

    resetLevelConnectCount(): void {
        this._levelConnectCount = 0;
    }

    isDealing(): boolean {
        return this._dealing;
    }

    private _clearBoard() {
        this._stopDealing();
        this._unscheduleConnectLineFx();
        this.node.removeAllChildren();
        this._lineNode = null;
        this._starBurstRoot = null;
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

    private _ensureStarBurstRoot(): Node {
        if (this._starBurstRoot && this._starBurstRoot.isValid) return this._starBurstRoot;
        const n = new Node('ConnectLineStars');
        n.setParent(this.node);
        const ut = n.addComponent(UITransform);
        const ui = this.node.getComponent(UITransform);
        if (ui) ut.setContentSize(ui.width, ui.height);
        n.setPosition(0, 0, 0);
        this._starBurstRoot = n;
        return n;
    }

    private _unscheduleConnectLineFx() {
        if (this._scheduledHideLine) {
            this.unschedule(this._scheduledHideLine);
            this._scheduledHideLine = null;
        }
        if (this._scheduledFinishLine) {
            this.unschedule(this._scheduledFinishLine);
            this._scheduledFinishLine = null;
        }
    }

    /** Creator 3.x：先 `路径/spriteFrame`，再整图 SpriteFrame，再 Texture2D 包一层（纯 texture 图无子资源时） */
    private _loadResourcesSpriteFrame(basePath: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            resources.load(`${basePath}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) {
                    resolve(sf);
                    return;
                }
                resources.load(basePath, SpriteFrame, (err2, sf2) => {
                    if (!err2 && sf2) {
                        resolve(sf2);
                        return;
                    }
                    resources.load(basePath, Texture2D, (err3, tex) => {
                        if (err3 || !tex) {
                            resolve(null);
                            return;
                        }
                        const w = tex.width;
                        const h = tex.height;
                        const sf3 = new SpriteFrame();
                        sf3.texture = tex;
                        sf3.rect = new Rect(0, 0, w, h);
                        sf3.originalSize = new Size(w, h);
                        sf3.offset = new Vec2(0, 0);
                        resolve(sf3);
                    });
                });
            });
        });
    }

    private _getStarSpriteFrame(): Promise<SpriteFrame | null> {
        if (this._starSpriteFrame !== undefined) {
            return Promise.resolve(this._starSpriteFrame);
        }
        if (this._starSpriteFramePromise) return this._starSpriteFramePromise;
        this._starSpriteFramePromise = this._loadResourcesSpriteFrame(STAR_PATH_RES).then((sf) => {
            this._starSpriteFrame = sf ?? null;
            return this._starSpriteFrame;
        });
        return this._starSpriteFramePromise;
    }

    private _pathToLocals(path: Array<{ r: number; c: number }>): Vec3[] {
        return path.map((p) => {
            const { x, y } = this._padToLocal(p.r, p.c);
            return new Vec3(x, y, 0);
        });
    }

    /** u∈[0,1] 按折线弧长插值 */
    private _pointOnPolyline(points: Vec3[], u: number): Vec3 {
        if (points.length === 0) return new Vec3();
        if (points.length === 1) return points[0].clone();
        const uu = math.clamp01(u);
        let total = 0;
        const lens: number[] = [];
        for (let i = 1; i < points.length; i++) {
            const d = Vec3.distance(points[i - 1], points[i]);
            lens.push(d);
            total += d;
        }
        if (total < 1e-4) return points[0].clone();
        let t = uu * total;
        for (let i = 0; i < lens.length; i++) {
            const L = lens[i];
            if (t <= L || i === lens.length - 1) {
                const k = math.clamp01(L < 1e-4 ? 0 : t / L);
                const a = points[i];
                const b = points[i + 1];
                return new Vec3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0);
            }
            t -= L;
        }
        return points[points.length - 1].clone();
    }

    private _strokePathLayers(g: Graphics, locals: Vec3[]) {
        if (locals.length < 2) return;
        const strokeOnce = (width: number, color: Color) => {
            g.lineWidth = width;
            g.strokeColor = color;
            g.moveTo(locals[0].x, locals[0].y);
            for (let i = 1; i < locals.length; i++) {
                g.lineTo(locals[i].x, locals[i].y);
            }
            g.stroke();
        };
        const anyG = g as Graphics & { lineJoin?: number; lineCap?: number };
        if (typeof anyG.lineJoin === 'number') anyG.lineJoin = 1;
        if (typeof anyG.lineCap === 'number') anyG.lineCap = 1;
        strokeOnce(14, new Color(200, 130, 30, 70));
        strokeOnce(9, new Color(255, 185, 60, 140));
        strokeOnce(5.5, new Color(255, 220, 120, 220));
        strokeOnce(2.8, new Color(255, 252, 230, 255));
    }

    private _spawnStarBurst(locals: Vec3[], sf: SpriteFrame) {
        const root = this._ensureStarBurstRoot();
        if (!root.isValid) return;
        const nStars = STAR_BURST_COUNT;
        const dur = STAR_BURST_DURATION;
        for (let i = 0; i < nStars; i++) {
            const u = math.clamp01((i + Math.random() * 0.9) / Math.max(1, nStars - 0.5));
            const base = this._pointOnPolyline(locals, u);
            const jitter = 10;
            const pos = new Vec3(
                base.x + (Math.random() - 0.5) * jitter,
                base.y + (Math.random() - 0.5) * jitter,
                0,
            );
            const angle = Math.random() * Math.PI * 2;
            const dist = 38 + Math.random() * 52;
            const dest = new Vec3(pos.x + Math.cos(angle) * dist, pos.y + Math.sin(angle) * dist, 0);
            const size = math.lerp(STAR_SIZE_MIN, STAR_SIZE_MAX, Math.random());

            const starN = new Node(`StarBurst_${i}`);
            starN.setParent(root);
            starN.setPosition(pos);
            const ut = starN.addComponent(UITransform);
            ut.setAnchorPoint(0.5, 0.5);
            ut.setContentSize(size, size);
            const sp = starN.addComponent(Sprite);
            sp.spriteFrame = sf;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            ut.setContentSize(size, size);
            sp.color = new Color(255, 248, 210, 255);
            const op = starN.addComponent(UIOpacity);
            op.opacity = 255;

            tween(starN)
                .parallel(
                    tween(starN).to(dur, { position: dest }, { easing: easing.sineOut }),
                    tween(op).to(dur, { opacity: 0 }, { easing: easing.sineIn }),
                )
                .call(() => {
                    if (starN.isValid) starN.destroy();
                })
                .start();
        }
        root.setSiblingIndex(this.node.children.length - 1);
    }

    private _drawConnectLine(r1: number, c1: number, r2: number, c2: number) {
        const path = LinkUpPathFinder.findPath(this.grid, r1, c1, r2, c2);
        if (!path || path.length < 2) return;
        const g = this._ensureLineNode();
        g.clear();

        this._unscheduleConnectLineFx();
        const fxGen = ++this._connectLineFxGeneration;
        const hideGen = fxGen;
        this._scheduledHideLine = () => {
            if (this._connectLineFxGeneration !== hideGen) return;
            this._lineNode?.getComponent(Graphics)?.clear();
        };
        const finishGen = fxGen;
        this._scheduledFinishLine = () => {
            if (this._connectLineFxGeneration !== finishGen) return;
            const sr = this._starBurstRoot;
            if (sr?.isValid) sr.removeAllChildren();
            this._lineNode?.getComponent(Graphics)?.clear();
            this._scheduledHideLine = null;
            this._scheduledFinishLine = null;
        };
        this.scheduleOnce(this._scheduledHideLine, CONNECT_LINE_VISIBLE);
        this.scheduleOnce(this._scheduledFinishLine, STAR_BURST_DURATION);

        const locals = this._pathToLocals(path);
        this._strokePathLayers(g, locals);

        this._lineNode!.setSiblingIndex(this.node.children.length - 1);

        const fxGenStar = fxGen;
        void this._getStarSpriteFrame().then((sf) => {
            if (fxGenStar !== this._connectLineFxGeneration || !sf || !this.node.isValid) return;
            this._spawnStarBurst(locals, sf);
        });
    }

    /** 新开一局：凑满棋盘；仅用 `_activeTypeIds`（非空）发牌，否则用 1…TYPE_COUNT */
    private _buildFullLevelBag(): number[] {
        const cellCount = BOARD_ROWS * BOARD_COLS;
        if (this._activeTypeIds.length > 0) {
            const counts = this._evenTileCountsPerSlot(this._activeTypeIds.length, cellCount);
            if (!counts) return [];
            return this._bagFromTypeCounts(this._activeTypeIds, counts);
        }
        const ids = Array.from({ length: TYPE_COUNT }, (_, i) => i + 1);
        const counts = this._evenTileCountsPerSlot(TYPE_COUNT, cellCount);
        if (!counts) return [];
        return this._bagFromTypeCounts(ids, counts);
    }

    /**
     * 每种至少 2 张且为偶数、总和 = cellCount。
     * 多出来的「对子」按轮加在后 min(剩余对子, m) 种上，避免 m 较小时 extraPairs>m 出现负下标。
     */
    private _evenTileCountsPerSlot(m: number, cellCount: number): number[] | null {
        const minEach = 2;
        if (m <= 0 || cellCount < m * minEach) return null;
        const counts = new Array(m).fill(minEach);
        let remaining = cellCount - m * minEach;
        if (remaining % 2 !== 0) return null;
        let pairsLeft = remaining / 2;
        while (pairsLeft > 0) {
            const k = Math.min(pairsLeft, m);
            for (let i = m - k; i < m; i++) counts[i] += 2;
            pairsLeft -= k;
        }
        return counts;
    }

    private _bagFromTypeCounts(typeIds: number[], counts: number[]): number[] {
        const bag: number[] = [];
        for (let ti = 0; ti < typeIds.length; ti++) {
            const id = typeIds[ti];
            const n = counts[ti];
            for (let j = 0; j < n; j++) bag.push(id);
        }
        return bag;
    }

    private _typePoolForBag(): number[] {
        if (this._activeTypeIds.length > 0) return [...this._activeTypeIds];
        return Array.from({ length: TYPE_COUNT }, (_, i) => i + 1);
    }

    /** 为场上 n 个格子生成类型 multiset（用于重排失败后换类型） */
    private _buildBagForCellCount(cellCount: number): number[] {
        if (cellCount <= 0) return [];
        if (cellCount === 1) return [this._typePoolForBag()[0] ?? 1];
        if (cellCount === 2) {
            const id = this._typePoolForBag()[0] ?? 1;
            return [id, id];
        }

        const pool = this._typePoolForBag();
        this._shuffle(pool);

        for (let m = Math.min(pool.length, Math.floor(cellCount / 2)); m >= 1; m--) {
            const types = pool.slice(0, m);
            const counts = this._evenTileCountsPerSlot(m, cellCount);
            if (counts) return this._bagFromTypeCounts(types, counts);
        }

        if (cellCount % 2 === 1) {
            const even = this._buildBagForCellCount(cellCount - 1);
            if (even.length === cellCount - 1) {
                even.push(even[Math.floor(Math.random() * even.length)] ?? pool[0] ?? 1);
                return even;
            }
        }

        const bag: number[] = [];
        while (bag.length + 2 <= cellCount) {
            const id = pool[Math.floor(Math.random() * pool.length)] ?? 1;
            bag.push(id, id);
        }
        while (bag.length < cellCount) {
            bag.push(pool[0] ?? 1);
        }
        return bag.slice(0, cellCount);
    }

    private _occupiedCells(): Array<{ r: number; c: number }> {
        const occ: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this.grid[r][c] != null) occ.push({ r, c });
            }
        }
        return occ;
    }

    private _syncAllCellVisuals() {
        this._sel = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                this._syncCellVisual(r, c);
            }
        }
        this._applySelectionTint();
    }

    /**
     * 保持空格不变，为在场方块重新分配类型并随机落位，直到存在可连对或用尽次数。
     */
    private _regenerateOccupiedTypes(maxTry: number): boolean {
        const occ = this._occupiedCells();
        const n = occ.length;
        if (n < 2) return false;

        for (let t = 0; t < maxTry; t++) {
            const bag = this._buildBagForCellCount(n);
            if (bag.length !== n) continue;
            this._shuffle(bag);
            const slots = [...occ];
            this._shuffle(slots);
            for (let i = 0; i < n; i++) {
                this.grid[slots[i].r][slots[i].c] = bag[i];
            }
            if (this.hasAnyConnectablePair()) {
                this._syncAllCellVisuals();
                return true;
            }
        }
        linkWarn('LinkUpBoard', '_regenerateOccupiedTypes: failed', { n, maxTry });
        return false;
    }

    private _fillRandomSolvable() {
        const maxTry = 80;
        for (let t = 0; t < maxTry; t++) {
            const bag = this._buildFullLevelBag();
            if (bag.length !== BOARD_ROWS * BOARD_COLS) {
                break;
            }
            this._shuffle(bag);
            let i = 0;
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    this.grid[r][c] = bag[i++];
                }
            }
            if (this.findHintPair() != null) {
                this._spawnCells(true);
                return;
            }
        }
        this._spawnCells(true);
    }

    private _invokeNoConnectOrShuffle() {
        if (this._dealing || !this._layoutReady() || this._isEmpty()) return;
        if (!this.hasAnyConnectablePair()) {
            if (this.onNoConnectablePair) {
                this.onNoConnectablePair();
            } else {
                this.shuffleAll(true);
            }
        }
    }

    private _shuffle<T>(arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private _stopDealing() {
        this._dealSessionId++;
        this._lastTap = null;
        this._dealing = false;
        this._dealPhase = null;
        this._dealAccum = 0;
        this._dealFinishWait = 0;
    }

    protected update(dt: number) {
        if (this._dealPhase == null || this._activeDealId !== this._dealSessionId || !this.isValid) return;

        if (this._dealPhase === 'finishing') {
            this._dealFinishWait += dt;
            if (this._dealFinishWait >= DEAL_DROP_DURATION) {
                this._dealPhase = null;
                this._finishDealing();
            }
            return;
        }

        this._dealAccum += dt;
        while (this._dealAccum >= DEAL_INTERVAL && this._dealIndex < this._dealOrder.length) {
            this._dealAccum -= DEAL_INTERVAL;
            this._spawnOneDealCell();
        }
        if (this._dealIndex >= this._dealOrder.length) {
            this._dealPhase = 'finishing';
            this._dealFinishWait = 0;
        }
    }

    private _finishDealing() {
        if (!this.isValid) return;
        this._dealing = false;
        this._applySelectionTint();
        this.onDealComplete?.();
        this._invokeNoConnectOrShuffle();
    }

    private _buildDealOrder(): Array<{ r: number; c: number }> {
        const order: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                order.push({ r, c });
            }
        }
        return order;
    }

    private _cellLocalPosition(r: number, c: number): Vec3 {
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const originX = -((BOARD_COLS * cw) >> 1);
        const originY = ((BOARD_ROWS * ch) >> 1);
        return new Vec3(originX + c * cw + cw / 2, originY - r * ch - ch / 2, 0);
    }

    private _createCellAt(r: number, c: number) {
        const cw = this._cellSize.w;
        const ch = this._cellSize.h;
        const tw = cw - 2;
        const th = ch - 2;
        const n = new Node(`cell_${r}_${c}`);
        n.setParent(this.node);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(tw, th);
        n.setPosition(this._cellLocalPosition(r, c));

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

    private _playDealTween(r: number, c: number) {
        const n = this._cells[r][c];
        if (!n?.isValid) return;
        const finalPos = this._cellLocalPosition(r, c);
        const ch = this._cellSize.h;
        n.setPosition(finalPos.x, finalPos.y + ch * 0.42, finalPos.z);
        n.setScale(0.5, 0.5, 1);
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        op.opacity = 40;

        tween(n).stop();
        tween(op).stop();
        tween(n)
            .parallel(
                tween(n).to(
                    DEAL_DROP_DURATION,
                    { position: finalPos, scale: new Vec3(1, 1, 1) },
                    { easing: easing.backOut },
                ),
                tween(op).to(DEAL_DROP_DURATION * 0.85, { opacity: 255 }, { easing: easing.sineOut }),
            )
            .start();
    }

    private _spawnOneDealCell() {
        if (this._dealIndex >= this._dealOrder.length) return;
        const { r, c } = this._dealOrder[this._dealIndex++];
        this._createCellAt(r, c);
        this._syncCellVisual(r, c);
        this._playDealTween(r, c);
    }

    /** @param animated true：从上往下、从左往右逐格发牌 */
    private _spawnCells(animated: boolean) {
        this._unscheduleConnectLineFx();
        this.node.removeAllChildren();
        this._lineNode = null;
        this._starBurstRoot = null;

        if (!animated) {
            this._stopDealing();
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    this._createCellAt(r, c);
                }
            }
            this._paintAll();
            return;
        }

        this._stopDealing();
        this._activeDealId = this._dealSessionId;
        this._dealing = true;
        this._dealOrder = this._buildDealOrder();
        this._dealIndex = 0;
        this._dealAccum = 0;
        this._dealFinishWait = 0;
        this._dealPhase = 'spawning';
        this._spawnOneDealCell();
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
                if (this._spritesOnlyMode) {
                    lab.string = '';
                    lab.enabled = false;
                } else {
                    lab.string = String(v);
                    lab.color = Color.WHITE;
                }
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

    private _selectCell(r: number, c: number) {
        this._sel = { r, c };
        this._applySelectionTint();
        this.onSelectSfx?.();
        this._playCellSelectPulse(r, c);
    }

    private _playCellSelectPulse(r: number, c: number) {
        const n = this._cells[r][c];
        if (!n?.isValid) return;
        Tween.stopAllByTarget(n);
        n.setScale(1, 1, 1);
        const peak = SELECT_PULSE_SCALE;
        tween(n)
            .to(SELECT_PULSE_UP, { scale: new Vec3(peak, peak, 1) }, { easing: easing.sineOut })
            .to(SELECT_PULSE_DOWN, { scale: new Vec3(1, 1, 1) }, { easing: easing.sineIn })
            .start();
    }

    private _playCellShake(r: number, c: number) {
        const n = this._cells[r][c];
        if (!n?.isValid) return;
        const base = this._cellLocalPosition(r, c);
        n.setPosition(base);
        const dx = SHAKE_OFFSET;
        const step = SHAKE_STEP;
        tween(n)
            .to(step, { position: new Vec3(base.x + dx, base.y, base.z) })
            .to(step, { position: new Vec3(base.x - dx, base.y, base.z) })
            .to(step, { position: new Vec3(base.x + dx * 0.6, base.y, base.z) })
            .to(step, { position: base })
            .start();
    }

    /** 双击：场上所有同类型方块一齐摇晃（与无法连线时的晃动一致） */
    private _playShakeForType(typeId: number) {
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this.grid[r][c] === typeId) this._playCellShake(r, c);
            }
        }
    }

    private _onCellTap(r: number, c: number) {
        if (this._dealing) return;
        const v = this.grid[r][c];
        if (v == null) return;

        const now = Date.now();
        if (
            this._lastTap &&
            this._lastTap.r === r &&
            this._lastTap.c === c &&
            now - this._lastTap.time <= DOUBLE_CLICK_MS
        ) {
            this._lastTap = null;
            if (this._sel?.r === r && this._sel.c === c) {
                this._sel = null;
                this._applySelectionTint();
            }
            this._playShakeForType(v);
            return;
        }
        this._lastTap = { r, c, time: now };

        if (!this._sel) {
            this._selectCell(r, c);
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
            this._selectCell(r, c);
            return;
        }
        if (LinkUpPathFinder.canConnect(this.grid, r0, c0, r, c)) {
            this._levelConnectCount++;
            this.onConnectSfx?.();
            this._drawConnectLine(r0, c0, r, c);
            this.grid[r0][c0] = null;
            this.grid[r][c] = null;
            this._sel = null;
            this._syncCellVisual(r0, c0);
            this._syncCellVisual(r, c);
            this._afterChange();
        } else {
            this._playCellShake(r0, c0);
            this._playCellShake(r, c);
            this._selectCell(r, c);
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

    private _gravityDirForLevel(): GravityDir | null {
        switch (this._level) {
            case 2:
                return 'left';
            case 3:
                return 'right';
            case 4:
                return 'up';
            case 5:
                return 'down';
            default:
                return null;
        }
    }

    private _computeGravity(
        dir: GravityDir,
    ): { grid: (number | null)[][]; moves: GravityMove[] } {
        const next: (number | null)[][] = [];
        const moves: GravityMove[] = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            next[r] = [];
            for (let c = 0; c < BOARD_COLS; c++) next[r][c] = null;
        }

        if (dir === 'left' || dir === 'right') {
            for (let r = 0; r < BOARD_ROWS; r++) {
                const items: Array<{ c: number; v: number }> = [];
                for (let c = 0; c < BOARD_COLS; c++) {
                    const v = this.grid[r][c];
                    if (v != null) items.push({ c, v });
                }
                for (let i = 0; i < items.length; i++) {
                    const newC = dir === 'left' ? i : BOARD_COLS - items.length + i;
                    const oldC = items[i].c;
                    next[r][newC] = items[i].v;
                    if (oldC !== newC) {
                        moves.push({ fromR: r, fromC: oldC, toR: r, toC: newC });
                    }
                }
            }
        } else {
            for (let c = 0; c < BOARD_COLS; c++) {
                const items: Array<{ r: number; v: number }> = [];
                for (let r = 0; r < BOARD_ROWS; r++) {
                    const v = this.grid[r][c];
                    if (v != null) items.push({ r, v });
                }
                for (let i = 0; i < items.length; i++) {
                    const newR = dir === 'up' ? i : BOARD_ROWS - items.length + i;
                    const oldR = items[i].r;
                    next[newR][c] = items[i].v;
                    if (oldR !== newR) {
                        moves.push({ fromR: oldR, fromC: c, toR: newR, toC: c });
                    }
                }
            }
        }
        return { grid: next, moves };
    }

    private _applyGravityWithAnimation(onDone: () => void): boolean {
        const dir = this._gravityDirForLevel();
        if (!dir) {
            onDone();
            return false;
        }
        const { grid: next, moves } = this._computeGravity(dir);
        if (moves.length === 0) {
            onDone();
            return false;
        }
        this.grid = next;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                this._syncCellVisual(r, c);
            }
        }
        this._gravityAnimGen++;
        const gen = this._gravityAnimGen;
        let pending = 0;
        const finishOne = () => {
            pending--;
            if (pending <= 0 && gen === this._gravityAnimGen && this.isValid) {
                for (let r = 0; r < BOARD_ROWS; r++) {
                    for (let c = 0; c < BOARD_COLS; c++) {
                        const n = this._cells[r][c];
                        if (n?.isValid) n.setPosition(this._cellLocalPosition(r, c));
                    }
                }
                onDone();
            }
        };
        for (const m of moves) {
            const n = this._cells[m.toR][m.toC];
            if (!n?.isValid || !n.active) continue;
            const fromPos = this._cellLocalPosition(m.fromR, m.fromC);
            const toPos = this._cellLocalPosition(m.toR, m.toC);
            n.setPosition(fromPos);
            pending++;
            Tween.stopAllByTarget(n);
            tween(n)
                .to(GRAVITY_MOVE_DURATION, { position: toPos }, { easing: easing.backOut })
                .call(finishOne)
                .start();
        }
        if (pending === 0) onDone();
        return true;
    }

    private _afterChange() {
        this._applyGravityWithAnimation(() => this._afterChangeCore());
    }

    private _afterChangeCore() {
        if (this._isEmpty()) {
            this.onWin?.(this._levelConnectCount);
            return;
        }
        if (!this.hasAnyConnectablePair()) {
            if (this.onNoConnectablePair) {
                this.onNoConnectablePair();
            } else {
                this.shuffleAll(true);
            }
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
        if (this._dealing) return;
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
        if (this._dealing || !this._layoutReady()) return;
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
        if (ensurePair && !this._isEmpty() && !this.hasAnyConnectablePair()) {
            if (this._regenerateOccupiedTypes(80)) {
                return;
            }
        }
        this._syncAllCellVisuals();
    }

    removeTwoRandomTiles() {
        if (this._dealing || !this._layoutReady()) return;
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
        const sr = this._starBurstRoot;
        if (sr && ui) {
            sr.getComponent(UITransform)?.setContentSize(ui.width, ui.height);
        }
    }
}
