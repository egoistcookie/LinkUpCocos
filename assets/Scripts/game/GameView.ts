import {
    _decorator,
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
    /** GameApp 注入的全屏游戏页背景；未配置则不建 GameBg */
    private _gameBackground: SpriteFrame | null = null;
    private _gameBgNode: Node | null = null;

    onBack: (() => void) | null = null;

    /** GameRoot 初始常为 inactive：start 在首次激活后调用，晚于同帧已执行过的 GameApp.start，可读到 App 上配置的按钮贴图 */
    start() {
        void this._buildUi();
    }

    beginOrRestartLevel(level: number) {
        this._level = level;
        if (this._levelLabel) this._levelLabel.string = `第 ${this._level} 关`;
        if (!this._board) {
            this._pendingStartLevel = level;
            return;
        }
        this.scheduleOnce(() => {
            this._board?.buildLevel();
            this._board?.resizeToParent();
        }, 0);
    }

    /** 棋盘格子贴图（30 项），由 GameApp 注入 */
    setTileFaceSprites(frames: Array<SpriteFrame | null>) {
        this._tileFaceCache = frames.length > 0 ? [...frames] : [];
        if (this._board) {
            this._board.setTileFaceSprites(this._tileFaceCache);
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
        this._board?.resizeToParent();
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
        this._board.onWin = () => {
            this.beginOrRestartLevel(this._level + 1);
        };
        if (this._tileFaceCache && this._tileFaceCache.length > 0) {
            this._board.setTileFaceSprites(this._tileFaceCache);
        }

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

        mkTool('Hint', -220, sfHint, sfHint1, () => this._board?.showHint());
        mkTool('Refresh', 0, sfRefresh, sfRefresh1, () => this._board?.shuffleAll(true));
        mkTool('Eliminate', 220, sfElim, sfElim1, () => this._board?.removeTwoRandomTiles());

        if (this._pendingStartLevel != null) {
            const lv = this._pendingStartLevel;
            this._pendingStartLevel = null;
            this._level = lv;
            if (this._levelLabel) this._levelLabel.string = `第 ${lv} 关`;
            this._board.buildLevel();
            this.scheduleOnce(() => this._board?.resizeToParent(), 0);
        }

        if (this._gameBgNode) {
            this.scheduleOnce(() => this.relayout(), 0);
        }
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
