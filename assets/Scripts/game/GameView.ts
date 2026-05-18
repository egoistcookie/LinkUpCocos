import {
    _decorator,
    AudioClip,
    AudioSource,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Widget,
} from 'cc';
import { LinkUpBoard } from './LinkUpBoard';
import { getStableVisibleSize } from '../util/ViewSize';
import { consumeProp, type PropKind } from '../util/PlayerResourceStorage';

const { ccclass } = _decorator;

/** 游戏页工具按钮贴图：由 GameApp 注入；未配置项则回退到 resources/icon 动态加载 */
export type GameToolButtonSprites = {
    backNormal: SpriteFrame | null;
    backPressed: SpriteFrame | null;
    hintNormal: SpriteFrame | null;
    hintPressed: SpriteFrame | null;
    refreshNormal: SpriteFrame | null;
    refreshPressed: SpriteFrame | null;
    eliminateNormal: SpriteFrame | null;
    eliminatePressed: SpriteFrame | null;
};

/** 通关金币奖励弹窗（由 GameApp 配置） */
export type CoinRewardDialogConfig = {
    panelBg: SpriteFrame | null;
    coinIcon: SpriteFrame | null;
};

/** 无可连对时的提示（由 GameApp 配置） */
export type NoConnectDialogConfig = {
    message: string;
    /** 副标题，可留空 */
    title: string;
    /** 展示多少秒后自动 shuffle */
    autoDelay: number;
    /** 弹窗底板图，不配置则用纯色块 */
    panelBg: SpriteFrame | null;
};

/** 游戏页音效：由 GameApp 注入；未配置则不播放 */
export type GameSfxConfig = {
    connect: AudioClip | null;
    select: AudioClip | null;
    hint: AudioClip | null;
    refresh: AudioClip | null;
    eliminate: AudioClip | null;
};

const C_BAR = new Color(0x0d, 0x1b, 0x2a, 220);
const C_BTN = new Color(0x41, 0x5a, 0x77, 255);

/** 棋盘区高度比原中间槽再缩小（与背景无关） */
const BOARD_SLOT_H_SHRINK = 20;
const BOARD_SLOT_H_SHRINK_HALF = BOARD_SLOT_H_SHRINK >> 1;

/**
 * resources 下资源基路径（相对 assets/resources/，无 .png、无 /spriteFrame）。
 * 运行时加载 SpriteFrame 会先尝试 `基路径/spriteFrame`（单图子资源），失败再试基路径。
 */
const ICON_BACK = 'icon/返回';
const ICON_HINT = 'icon/提示';
const ICON_REFRESH = 'icon/刷新';
const ICON_ELIMINATE = 'icon/消除';
const ICON_BACK_DOWN = 'icon/返回1';
const ICON_HINT_DOWN = 'icon/提示1';
const ICON_REFRESH_DOWN = 'icon/刷新1';
const ICON_ELIMINATE_DOWN = 'icon/消除1';

/** 锚点默认 (0.5,0.5) 的节点上画居中矩形底（避免运行时 1×1 白贴图 Sprite 在部分环境下不显示） */
function addCenterFillRect(node: Node, w: number, h: number, fill: Color) {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
}

/** 与 BoardHolder 上 Widget 边距一致；用 GameRoot 尺寸算出棋盘区宽高，不依赖 bhUt 首帧 */
function boardHolderLayoutFromRoot(root: Node): {
    w: number;
    h: number;
    top: number;
    bottom: number;
    left: number;
    right: number;
} {
    const ut = root.getComponent(UITransform);
    const vs = getStableVisibleSize();
    const lw = ut && ut.width > 1 ? ut.width : vs.width;
    const lh = ut && ut.height > 1 ? ut.height : vs.height;
    const BAR_TOP = 88;
    const BAR_BOT = 100;
    const STRIP_GAP = 12;
    const SYMM_PAD = 50;
    const edgeInset = Math.max(BAR_TOP + STRIP_GAP, BAR_BOT + STRIP_GAP) + SYMM_PAD;
    const boardSideInset = 24 + 50;
    return {
        w: lw - boardSideInset * 2,
        h: lh - edgeInset * 2 - BOARD_SLOT_H_SHRINK,
        top: edgeInset + BOARD_SLOT_H_SHRINK_HALF,
        bottom: edgeInset + BOARD_SLOT_H_SHRINK_HALF,
        left: boardSideInset,
        right: boardSideInset,
    };
}

function gameRootFullSize(root: Node): { w: number; h: number } {
    const ut = root.getComponent(UITransform);
    const vs = getStableVisibleSize();
    return {
        w: ut && ut.width > 1 ? ut.width : vs.width,
        h: ut && ut.height > 1 ? ut.height : vs.height,
    };
}

@ccclass('GameView')
export class GameView extends Component {
    private _level = 1;
    private _levelLabel: Label | null = null;
    private _board: LinkUpBoard | null = null;
    /** GameApp.start 可能在异步 _buildUi 完成前就注入格子贴图；此时 _board 尚不存在，需延后应用到 LinkUpBoard */
    private _tileFaceCache: Array<SpriteFrame | null> | null = null;
    /** GameApp.start 注入；父节点 start 晚于子 onLoad，须在 _buildUi 内延后一帧再读 */
    private _toolBtnSprites: Partial<GameToolButtonSprites> | null = null;
    /** 若「开始游戏」早于异步 _buildUi 建完棋盘，则在此补开局 */
    private _pendingStartLevel: number | null = null;
    /** 防止重复 schedule / pending 导致连续两次 buildLevel 打断发牌 */
    private _buildLevelGen = 0;
    /** GameApp 注入的全屏游戏页背景；未配置则不建 GameBg */
    private _gameBackground: SpriteFrame | null = null;
    private _gameBgNode: Node | null = null;
    private _sfx: GameSfxConfig | null = null;
    private _audioSource: AudioSource | null = null;
    private _noConnectCfg: NoConnectDialogConfig | null = null;
    private _noConnectTimerGen = 0;
    private _coinRewardCfg: CoinRewardDialogConfig | null = null;

    /** GameApp 注入的卡组类型子集（≥30）；无贴图模式时为 null */
    private _deckTypeIds: number[] | null = null;
    /** 是否启用商店道具库存（购买后消耗） */
    private _shopPropsEnabled = false;

    onBack: (() => void) | null = null;
    /** 关卡通关：参数为本关连线次数（由 GameApp 结算并弹窗） */
    onLevelWin: ((connectCount: number) => void) | null = null;

    /** GameRoot 初始常为 inactive：start 在首次激活后调用，晚于同帧已执行过的 GameApp.start，可读到 App 上配置的按钮贴图 */
    start() {
        void this._buildUi();
    }

    getLevel(): number {
        return this._level;
    }

    /** 本关尚未结算的连线次数（用于退出游戏时静默结算） */
    getPendingConnectCoins(): number {
        return this._board?.getLevelConnectCount() ?? 0;
    }

    /** 取出并清零本关连线计数，避免重复结算 */
    takePendingConnectCoins(): number {
        const c = this._board?.getLevelConnectCount() ?? 0;
        this._board?.resetLevelConnectCount();
        return c;
    }

    beginOrRestartLevel(level: number) {
        this._level = level;
        if (this._levelLabel) this._levelLabel.string = `第 ${this._level} 关`;
        if (!this._board) {
            this._pendingStartLevel = level;
            return;
        }
        this._buildLevelGen++;
        const gen = this._buildLevelGen;
        this.scheduleOnce(() => {
            if (gen !== this._buildLevelGen || !this._board) return;
            this._runBuildLevel(this._board);
        }, 0);
    }

    private _runBuildLevel(board: LinkUpBoard) {
        const prevOnDeal = board.onDealComplete;
        board.onDealComplete = () => {
            board.resizeToParent();
            prevOnDeal?.();
        };
        board.buildLevel();
    }

    /** 棋盘格子贴图（与 TILE_SPRITE_SLOTS 一致，由 GameApp 注入） */
    setTileFaceSprites(frames: Array<SpriteFrame | null>) {
        this._tileFaceCache = frames.length > 0 ? [...frames] : [];
        if (this._board) {
            this._board.setTileFaceSprites(this._tileFaceCache);
            this._applyDeckToBoard();
        }
        this._wireBoardCallbacks();
    }

    /** 由 GameApp 根据本地卡组或 null（恢复为全部已配置类型）注入 */
    setDeckTypeIds(typeIds: number[] | null) {
        this._deckTypeIds = typeIds && typeIds.length > 0 ? [...typeIds] : null;
        this._applyDeckToBoard();
    }

    setShopPropsEnabled(enabled: boolean) {
        this._shopPropsEnabled = enabled;
    }

    private _applyDeckToBoard() {
        if (!this._board) return;
        if (this._deckTypeIds && this._deckTypeIds.length > 0) {
            this._board.setDeckTypeIds(this._deckTypeIds);
        } else {
            this._board.setDeckTypeIds(null);
        }
    }

    /** 顶栏返回 + 底栏提示/刷新/消除 共 8 张（普通+按下），由 GameApp 注入；留空则用 resources 默认 icon */
    setToolButtonSprites(sprites: Partial<GameToolButtonSprites> | null) {
        this._toolBtnSprites = sprites && Object.keys(sprites).length > 0 ? { ...sprites } : null;
    }

    /** 游戏主体页全屏背景，由 GameApp 注入 */
    setGameBackground(sf: SpriteFrame | null) {
        this._gameBackground = sf;
        if (!this._gameBgNode?.isValid) return;
        if (!sf) {
            this._gameBgNode.destroy();
            this._gameBgNode = null;
            return;
        }
        const sp = this._gameBgNode.getComponent(Sprite);
        if (sp) {
            sp.spriteFrame = sf;
            sp.enabled = true;
        }
        this.scheduleOnce(() => this.relayout(), 0);
    }

    /** 连线成功 / 底栏工具音效，由 GameApp 注入 */
    setGameSfx(sfx: GameSfxConfig | null) {
        this._sfx =
            sfx && (sfx.connect || sfx.select || sfx.hint || sfx.refresh || sfx.eliminate) ? { ...sfx } : null;
        this._wireBoardCallbacks();
    }

    /** 无可连对提示文案与自动刷新延迟，由 GameApp 注入；传 null 则恢复为仅洗牌、不弹窗 */
    setNoConnectDialog(cfg: NoConnectDialogConfig | null) {
        this._noConnectCfg = cfg ? { ...cfg } : null;
        this._wireBoardCallbacks();
    }

    /** 通关金币奖励弹窗样式，由 GameApp 注入 */
    setCoinRewardDialog(cfg: CoinRewardDialogConfig | null) {
        this._coinRewardCfg = cfg ? { ...cfg } : null;
    }

    /** 通关奖励提示（点击继续后执行 onContinue） */
    openCoinRewardOverlay(coinAmount: number, onContinue: () => void) {
        const cfg = this._coinRewardCfg;
        const root = this.node;
        const prev = root.getChildByName('CoinRewardOverlay');
        prev?.destroy();

        const { w, h } = gameRootFullSize(root);
        const layer = new Node('CoinRewardOverlay');
        layer.setParent(root);
        layer.setSiblingIndex(root.children.length - 1);
        const layerUt = layer.addComponent(UITransform);
        layerUt.setContentSize(w, h);
        const layerWg = layer.addComponent(Widget);
        layerWg.isAlignTop = layerWg.isAlignBottom = layerWg.isAlignLeft = layerWg.isAlignRight = true;
        layerWg.top = layerWg.bottom = layerWg.left = layerWg.right = 0;
        layerWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        layerWg.updateAlignment();

        const dim = new Node('Dim');
        dim.setParent(layer);
        dim.addComponent(UITransform).setContentSize(w, h);
        const dimWg = dim.addComponent(Widget);
        dimWg.isAlignTop = dimWg.isAlignBottom = dimWg.isAlignLeft = dimWg.isAlignRight = true;
        dimWg.top = dimWg.bottom = dimWg.left = dimWg.right = 0;
        dimWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        dimWg.updateAlignment();
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(0, 0, 0, 160);
        dimG.fillRect(-w / 2, -h / 2, w, h);

        const panelW = Math.min(480, w - 48);
        const panelH = 200;
        const panel = new Node('Panel');
        panel.setParent(layer);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pWg = panel.addComponent(Widget);
        pWg.isAlignHorizontalCenter = true;
        pWg.isAlignVerticalCenter = true;
        pWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        pWg.updateAlignment();

        if (cfg?.panelBg) {
            const sp = panel.addComponent(Sprite);
            sp.spriteFrame = cfg.panelBg;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.color = Color.WHITE;
        } else {
            const pg = panel.addComponent(Graphics);
            pg.fillColor = new Color(0x12, 0x1e, 0x2e, 245);
            pg.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);
        }

        const titleN = new Node('Title');
        titleN.setParent(panel);
        titleN.setPosition(0, 52, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 32, 36);
        const tl = titleN.addComponent(Label);
        tl.string = '通关奖励';
        tl.fontSize = 26;
        tl.color = new Color(0xe9, 0xc4, 0x6a, 255);
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        this._applyLabelOutline(tl);

        const rowY = 4;
        if (cfg?.coinIcon) {
            const iconN = new Node('CoinIcon');
            iconN.setParent(panel);
            iconN.setPosition(-56, rowY, 0);
            const r = cfg.coinIcon.rect;
            const uw = Math.max(1, r.width);
            const uh = Math.max(1, r.height);
            iconN.addComponent(UITransform).setContentSize(uw, uh);
            const isp = iconN.addComponent(Sprite);
            isp.spriteFrame = cfg.coinIcon;
            isp.sizeMode = Sprite.SizeMode.TRIMMED;
            const s = Math.min(40 / uw, 40 / uh);
            iconN.setScale(s, s, 1);
        }

        const amtN = new Node('Amount');
        amtN.setParent(panel);
        amtN.setPosition(cfg?.coinIcon ? 12 : 0, rowY, 0);
        amtN.addComponent(UITransform).setContentSize(panelW - 48, 44);
        const al = amtN.addComponent(Label);
        al.string = `+${coinAmount} 金币`;
        al.fontSize = 28;
        al.color = new Color(0xe9, 0xc4, 0x6a, 255);
        al.horizontalAlign = Label.HorizontalAlign.CENTER;
        al.verticalAlign = Label.VerticalAlign.CENTER;
        this._applyLabelOutline(al);

        const subN = new Node('Sub');
        subN.setParent(panel);
        subN.setPosition(0, -36, 0);
        subN.addComponent(UITransform).setContentSize(panelW - 40, 28);
        const sl = subN.addComponent(Label);
        sl.string = `本关连线 ${coinAmount} 次`;
        sl.fontSize = 18;
        sl.color = new Color(0xe0, 0xe1, 0xdd, 255);
        sl.horizontalAlign = Label.HorizontalAlign.CENTER;
        sl.verticalAlign = Label.VerticalAlign.CENTER;

        const btnN = new Node('Continue');
        btnN.setParent(panel);
        btnN.setPosition(0, -72, 0);
        btnN.addComponent(UITransform).setContentSize(160, 44);
        const bg = btnN.addComponent(Graphics);
        bg.fillColor = new Color(0x2d, 0x6a, 0x4f, 255);
        bg.fillRect(-80, -22, 160, 44);
        const btn = btnN.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        const blN = new Node('Label');
        blN.setParent(btnN);
        blN.addComponent(UITransform).setContentSize(160, 44);
        const bl = blN.addComponent(Label);
        bl.string = '继续';
        bl.fontSize = 22;
        bl.color = Color.WHITE;
        bl.horizontalAlign = Label.HorizontalAlign.CENTER;
        bl.verticalAlign = Label.VerticalAlign.CENTER;

        const close = () => {
            if (layer.isValid) layer.destroy();
            onContinue();
        };
        btnN.on(Button.EventType.CLICK, close, this);
    }

    private _applyLabelOutline(lab: Label) {
        lab.enableOutline = true;
        lab.outlineColor = Color.BLACK;
        lab.outlineWidth = 2;
    }

    /** Canvas 尺寸变化时：BoardHolder 与全屏 GameBg */
    relayout() {
        const holder = this.node.getChildByName('BoardHolder');
        if (holder?.isValid) {
            const lay = boardHolderLayoutFromRoot(this.node);
            const bhW = holder.getComponent(Widget);
            if (bhW) {
                bhW.top = lay.top;
                bhW.bottom = lay.bottom;
                bhW.left = lay.left;
                bhW.right = lay.right;
                bhW.updateAlignment();
            }
            const bhUt = holder.getComponent(UITransform);
            if (bhUt) bhUt.setContentSize(lay.w, lay.h);
        }
        const bg = this._gameBgNode;
        if (bg?.isValid) {
            const { w, h } = gameRootFullSize(this.node);
            const bgUt = bg.getComponent(UITransform);
            if (bgUt) bgUt.setContentSize(w, h);
            bg.getComponent(Widget)?.updateAlignment();
            const sp = bg.getComponent(Sprite);
            if (sp) sp.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        if (this._board && !this._board.isDealing()) {
            this._board.resizeToParent();
        }
    }

    private async _buildUi() {
        const o = this._toolBtnSprites;
        const pick = (path: string, fromApp: SpriteFrame | null | undefined) =>
            fromApp != null ? Promise.resolve(fromApp) : GameView._loadSpriteFrame(path);

        const [
            sfBack,
            sfHint,
            sfRefresh,
            sfElim,
            sfBack1,
            sfHint1,
            sfRefresh1,
            sfElim1,
        ] = await Promise.all([
            pick(ICON_BACK, o?.backNormal),
            pick(ICON_HINT, o?.hintNormal),
            pick(ICON_REFRESH, o?.refreshNormal),
            pick(ICON_ELIMINATE, o?.eliminateNormal),
            pick(ICON_BACK_DOWN, o?.backPressed),
            pick(ICON_HINT_DOWN, o?.hintPressed),
            pick(ICON_REFRESH_DOWN, o?.refreshPressed),
            pick(ICON_ELIMINATE_DOWN, o?.eliminatePressed),
        ]);
        if (!sfBack || !sfHint || !sfRefresh || !sfElim) {
            console.warn(
                '[GameView] 部分按钮贴图未加载成功；可在 App 节点 GameApp 上配置 8 项按钮贴图，或确认 resources/icon 下存在对应 PNG（sprite-frame），路径形如 icon/返回/spriteFrame',
            );
        }

        const root = this.node;
        const vs = getStableVisibleSize();
        const rw = root.addComponent(UITransform);
        rw.setContentSize(vs.width, vs.height);
        const w = root.addComponent(Widget);
        w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
        w.top = w.bottom = w.left = w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();

        const bgSf = this._gameBackground;
        if (bgSf) {
            const bgNode = new Node('GameBg');
            bgNode.setParent(root);
            bgNode.setSiblingIndex(0);
            const full = gameRootFullSize(root);
            const bgUt = bgNode.addComponent(UITransform);
            const bgWg = bgNode.addComponent(Widget);
            bgWg.isAlignTop = bgWg.isAlignBottom = bgWg.isAlignLeft = bgWg.isAlignRight = true;
            bgWg.top = bgWg.bottom = bgWg.left = bgWg.right = 0;
            bgWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
            bgWg.updateAlignment();
            bgUt.setContentSize(full.w, full.h);
            bgNode.setPosition(0, 0, -20);
            const bgSp = bgNode.addComponent(Sprite);
            bgSp.spriteFrame = bgSf;
            bgSp.sizeMode = Sprite.SizeMode.CUSTOM;
            bgSp.color = Color.WHITE;
            this._gameBgNode = bgNode;
        } else {
            this._gameBgNode = null;
        }

        const boardHolder = new Node('BoardHolder');
        boardHolder.setParent(root);
        const bhUt = boardHolder.addComponent(UITransform);
        const bhW = boardHolder.addComponent(Widget);
        bhW.isAlignTop = true;
        bhW.isAlignBottom = true;
        bhW.isAlignLeft = true;
        bhW.isAlignRight = true;
        const lay = boardHolderLayoutFromRoot(root);
        bhW.top = lay.top;
        bhW.bottom = lay.bottom;
        bhW.left = lay.left;
        bhW.right = lay.right;
        bhW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bhW.updateAlignment();
        bhUt.setContentSize(lay.w, lay.h);

        const boardNode = new Node('Board');
        boardNode.setParent(boardHolder);
        const bUt = boardNode.addComponent(UITransform);
        const bW = boardNode.addComponent(Widget);
        bW.isAlignTop = bW.isAlignBottom = bW.isAlignLeft = bW.isAlignRight = true;
        // 与 BoardHolder 同大，避免内缩一圈形成「丑边框」
        bW.top = bW.bottom = bW.left = bW.right = 0;
        bW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bW.updateAlignment();
        bUt.setContentSize(lay.w, lay.h);

        this._board = boardNode.addComponent(LinkUpBoard);
        this._board.onWin = (connectCount) => {
            this._board?.resetLevelConnectCount();
            this.onLevelWin?.(connectCount);
        };
        if (this._tileFaceCache && this._tileFaceCache.length > 0) {
            this._board.setTileFaceSprites(this._tileFaceCache);
        }
        this._applyDeckToBoard();
        this._wireBoardCallbacks();

        // 子节点顺序：GameRoot 下 GameBg(若有) → BoardHolder → TopBar → BottomBar

        const top = new Node('TopBar');
        top.setParent(root);
        const topUt = top.addComponent(UITransform);
        topUt.setContentSize(vs.width, 88);
        const topW = top.addComponent(Widget);
        topW.isAlignTop = true;
        topW.isAlignLeft = true;
        topW.isAlignRight = true;
        topW.top = 0;
        topW.left = topW.right = 0;
        topW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        topW.updateAlignment();
        addCenterFillRect(top, vs.width, 88, C_BAR);

        const lvlN = new Node('Level');
        lvlN.setParent(top);
        const ll = lvlN.addComponent(Label);
        ll.string = `第 ${this._level} 关`;
        ll.color = new Color(0xe0, 0xe1, 0xdd, 255);
        ll.fontSize = 28;
        ll.horizontalAlign = Label.HorizontalAlign.CENTER;
        ll.verticalAlign = Label.VerticalAlign.CENTER;
        lvlN.addComponent(UITransform).setContentSize(400, 60);
        lvlN.setPosition(0, 0, 0);
        const lvlW = lvlN.addComponent(Widget);
        lvlW.isAlignHorizontalCenter = true;
        lvlW.isAlignVerticalCenter = true;
        lvlW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        lvlW.updateAlignment();
        this._levelLabel = ll;

        const backN = new Node('Back');
        backN.setParent(top);
        backN.addComponent(UITransform).setContentSize(160, 64);
        const backW = backN.addComponent(Widget);
        backW.isAlignLeft = true;
        backW.isAlignVerticalCenter = true;
        backW.left = 8;
        backW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        backW.updateAlignment();
        if (sfBack) {
            backN.addComponent(Sprite);
        }
        const bbtn = backN.addComponent(Button);
        bbtn.target = backN;
        this._mountSpriteButton(backN, 160, 64, sfBack, sfBack1, bbtn);
        backN.on(Button.EventType.CLICK, () => this.onBack?.(), this);

        const bottom = new Node('BottomBar');
        bottom.setParent(root);
        const botUt = bottom.addComponent(UITransform);
        botUt.setContentSize(vs.width, 100);
        const botW = bottom.addComponent(Widget);
        botW.isAlignBottom = true;
        botW.isAlignLeft = true;
        botW.isAlignRight = true;
        botW.bottom = 0;
        botW.left = botW.right = 0;
        botW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        botW.updateAlignment();

        const mkTool = (
            name: string,
            x: number,
            sf: SpriteFrame | null,
            sfDown: SpriteFrame | null,
            handler: () => void,
        ) => {
            const n = new Node(name);
            n.setParent(bottom);
            n.addComponent(UITransform).setContentSize(200, 72);
            n.setPosition(x, 28, 0);
            if (sf) {
                n.addComponent(Sprite);
            }
            const btn = n.addComponent(Button);
            btn.target = n;
            this._mountSpriteButton(n, 200, 72, sf, sfDown, btn);
            n.on(Button.EventType.CLICK, handler, this);
        };

        mkTool('Hint', -220, sfHint, sfHint1, () => {
            if (!this._tryUseProp('hint')) return;
            this._playSfx(this._sfx?.hint);
            this._board?.showHint();
        });
        mkTool('Refresh', 0, sfRefresh, sfRefresh1, () => {
            if (!this._tryUseProp('refresh')) return;
            this._playSfx(this._sfx?.refresh);
            this._board?.shuffleAll(true);
        });
        mkTool('Eliminate', 220, sfElim, sfElim1, () => {
            if (!this._tryUseProp('eliminate')) return;
            this._playSfx(this._sfx?.eliminate);
            this._board?.removeTwoRandomTiles();
        });

        if (this._pendingStartLevel != null) {
            const lv = this._pendingStartLevel;
            this._pendingStartLevel = null;
            this._level = lv;
            if (this._levelLabel) this._levelLabel.string = `第 ${lv} 关`;
            this._buildLevelGen++;
            if (this._board) this._runBuildLevel(this._board);
        }

        if (this._gameBgNode) {
            this.scheduleOnce(() => this.relayout(), 0);
        }
    }

    private _tryUseProp(kind: PropKind): boolean {
        if (!this._shopPropsEnabled) return true;
        if (consumeProp(kind)) return true;
        const names = { hint: '提示', refresh: '刷新', eliminate: '消除' };
        this._showGameToast(`无${names[kind]}道具，请前往商店购买（50 金币）`);
        return false;
    }

    private _showGameToast(message: string) {
        const root = this.node;
        const old = root.getChildByName('GameToast');
        if (old?.isValid) old.destroy();
        const t = new Node('GameToast');
        t.setParent(root);
        t.setSiblingIndex(root.children.length - 1);
        const tw = Math.min(520, getStableVisibleSize().width - 48);
        t.addComponent(UITransform).setContentSize(tw, 100);
        const w = t.addComponent(Widget);
        w.isAlignTop = true;
        w.isAlignHorizontalCenter = true;
        w.top = 100;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();
        addCenterFillRect(t, tw, 88, new Color(0x0d, 0x1b, 0x2a, 230));
        const labN = new Node('Msg');
        labN.setParent(t);
        labN.addComponent(UITransform).setContentSize(tw - 24, 72);
        const lab = labN.addComponent(Label);
        lab.string = message;
        lab.fontSize = 20;
        lab.color = Color.WHITE;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        this.scheduleOnce(() => {
            if (t.isValid) t.destroy();
        }, 2);
    }

    private _wireBoardCallbacks() {
        if (!this._board) return;
        this._board.onConnectSfx = () => {
            this._playSfx(this._sfx?.connect);
        };
        this._board.onSelectSfx = () => {
            this._playSfx(this._sfx?.select);
        };
        this._board.onNoConnectablePair = this._noConnectCfg
            ? () => {
                  this._openNoConnectDialogAndRefresh();
              }
            : null;
    }

    private _openNoConnectDialogAndRefresh() {
        const cfg = this._noConnectCfg;
        if (!cfg || !this.node.isValid) {
            this._board?.shuffleAll(true);
            return;
        }
        const root = this.node;
        const prev = root.getChildByName('NoConnectOverlay');
        prev?.destroy();

        const myGen = ++this._noConnectTimerGen;
        const { w, h } = gameRootFullSize(root);
        const layer = new Node('NoConnectOverlay');
        layer.setParent(root);
        layer.setSiblingIndex(root.children.length - 1);
        const layerUt = layer.addComponent(UITransform);
        layerUt.setContentSize(w, h);
        const layerWg = layer.addComponent(Widget);
        layerWg.isAlignTop = layerWg.isAlignBottom = layerWg.isAlignLeft = layerWg.isAlignRight = true;
        layerWg.top = layerWg.bottom = layerWg.left = layerWg.right = 0;
        layerWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        layerWg.updateAlignment();

        const dim = new Node('Dim');
        dim.setParent(layer);
        const dimUt = dim.addComponent(UITransform);
        dimUt.setContentSize(w, h);
        const dimWg = dim.addComponent(Widget);
        dimWg.isAlignTop = dimWg.isAlignBottom = dimWg.isAlignLeft = dimWg.isAlignRight = true;
        dimWg.top = dimWg.bottom = dimWg.left = dimWg.right = 0;
        dimWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        dimWg.updateAlignment();
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(0, 0, 0, 160);
        dimG.fillRect(-w / 2, -h / 2, w, h);
        const dimBtn = dim.addComponent(Button);
        dimBtn.transition = Button.Transition.NONE;
        dimBtn.target = dim;

        const panelW = Math.min(520, w - 48);
        const hasTitle = !!(cfg.title && cfg.title.trim());
        const panelH = hasTitle ? 150 : 120;
        const panel = new Node('Panel');
        panel.setParent(layer);
        const pUt = panel.addComponent(UITransform);
        pUt.setContentSize(panelW, panelH);
        panel.setPosition(0, 0, 0);
        const pWg = panel.addComponent(Widget);
        pWg.isAlignHorizontalCenter = true;
        pWg.isAlignVerticalCenter = true;
        pWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        pWg.updateAlignment();

        if (cfg.panelBg) {
            const sp = panel.addComponent(Sprite);
            sp.spriteFrame = cfg.panelBg;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.color = Color.WHITE;
        } else {
            const pg = panel.addComponent(Graphics);
            pg.fillColor = new Color(0x12, 0x1e, 0x2e, 245);
            pg.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);
        }

        if (hasTitle) {
            const titleN = new Node('Title');
            titleN.setParent(panel);
            titleN.addComponent(UITransform).setContentSize(panelW - 32, 36);
            titleN.setPosition(0, 38, 0);
            const tl = titleN.addComponent(Label);
            tl.string = cfg.title.trim();
            tl.fontSize = 22;
            tl.color = new Color(0xff, 0xe0, 0xa0, 255);
            tl.horizontalAlign = Label.HorizontalAlign.CENTER;
            tl.verticalAlign = Label.VerticalAlign.CENTER;
            tl.overflow = Label.Overflow.RESIZE_HEIGHT;
        }

        const msgN = new Node('Message');
        msgN.setParent(panel);
        msgN.addComponent(UITransform).setContentSize(panelW - 40, panelH - 24);
        msgN.setPosition(0, hasTitle ? -8 : 0, 0);
        const ml = msgN.addComponent(Label);
        ml.string = cfg.message || '场上没有可连线方块，自动刷新';
        ml.fontSize = 20;
        ml.color = Color.WHITE;
        ml.horizontalAlign = Label.HorizontalAlign.CENTER;
        ml.verticalAlign = Label.VerticalAlign.CENTER;
        ml.overflow = Label.Overflow.RESIZE_HEIGHT;

        const delay = Math.max(0.25, cfg.autoDelay);
        this.scheduleOnce(() => {
            if (myGen !== this._noConnectTimerGen) return;
            layer.destroy();
            this._board?.shuffleAll(true);
            this._playSfx(this._sfx?.refresh);
        }, delay);
    }

    private _ensureAudioSource(): AudioSource | null {
        if (this._audioSource?.isValid) return this._audioSource;
        let a = this.node.getComponent(AudioSource);
        if (!a) {
            a = this.node.addComponent(AudioSource);
            a.playOnAwake = false;
        }
        this._audioSource = a;
        return a;
    }

    private _playSfx(clip: AudioClip | null | undefined) {
        if (!clip) return;
        const src = this._ensureAudioSource();
        if (src) src.playOneShot(clip, 1);
    }

    /**
     * 按钮贴图：普通态 + 按下态。Sprite 须在 Button 之前挂上（见调用处），否则 SPRITE 过渡易失效。
     * 按下态改为 TOUCH 手动换 spriteFrame，与预览 / 微信一致；无按下图时用普通图。
     */
    private _mountSpriteButton(
        node: Node,
        w: number,
        h: number,
        sfNormal: SpriteFrame | null,
        sfPressed: SpriteFrame | null,
        btn: Button,
    ) {
        if (!sfNormal) {
            addCenterFillRect(node, w, h, C_BTN);
            btn.transition = Button.Transition.NONE;
            return;
        }
        const sp = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sp.spriteFrame = sfNormal;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.color = Color.WHITE;
        btn.transition = Button.Transition.NONE;
        const pressSf = sfPressed ?? sfNormal;
        const toNormal = () => {
            if (sp.isValid && sfNormal) sp.spriteFrame = sfNormal;
        };
        const toPress = () => {
            if (sp.isValid) sp.spriteFrame = pressSf;
        };
        node.on(Node.EventType.TOUCH_START, toPress, node);
        node.on(Node.EventType.TOUCH_END, toNormal, node);
        node.on(Node.EventType.TOUCH_CANCEL, toNormal, node);
    }

    /** Creator 3.x 单图导入为 sprite-frame 时，子资源路径需带 `/spriteFrame`，仅写 png 基名往往拿不到 SpriteFrame */
    private static _loadSpriteFrame(basePath: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            resources.load(`${basePath}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) {
                    resolve(sf);
                    return;
                }
                resources.load(basePath, SpriteFrame, (err2, sf2) => {
                    resolve(!err2 && sf2 ? sf2 : null);
                });
            });
        });
    }
}
