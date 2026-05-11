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

const C_BAR = new Color(0x0d, 0x1b, 0x2a, 220);
const C_BTN = new Color(0x41, 0x5a, 0x77, 255);

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

@ccclass('GameView')
export class GameView extends Component {
    private _level = 1;
    private _levelLabel: Label | null = null;
    private _board: LinkUpBoard | null = null;
    /** GameApp.start 可能在异步 _buildUi 完成前就注入格子贴图；此时 _board 尚不存在，需延后应用到 LinkUpBoard */
    private _tileFaceCache: Array<SpriteFrame | null> | null = null;

    onBack: (() => void) | null = null;

    onLoad() {
        void this._buildUi();
    }

    beginOrRestartLevel(level: number) {
        this._level = level;
        if (this._levelLabel) this._levelLabel.string = `第 ${this._level} 关`;
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

    private async _buildUi() {
        let sfBack: SpriteFrame | null = null;
        let sfHint: SpriteFrame | null = null;
        let sfRefresh: SpriteFrame | null = null;
        let sfElim: SpriteFrame | null = null;
        let sfBack1: SpriteFrame | null = null;
        let sfHint1: SpriteFrame | null = null;
        let sfRefresh1: SpriteFrame | null = null;
        let sfElim1: SpriteFrame | null = null;
        [
            sfBack,
            sfHint,
            sfRefresh,
            sfElim,
            sfBack1,
            sfHint1,
            sfRefresh1,
            sfElim1,
        ] = await Promise.all([
            GameView._loadSpriteFrame(ICON_BACK),
            GameView._loadSpriteFrame(ICON_HINT),
            GameView._loadSpriteFrame(ICON_REFRESH),
            GameView._loadSpriteFrame(ICON_ELIMINATE),
            GameView._loadSpriteFrame(ICON_BACK_DOWN),
            GameView._loadSpriteFrame(ICON_HINT_DOWN),
            GameView._loadSpriteFrame(ICON_REFRESH_DOWN),
            GameView._loadSpriteFrame(ICON_ELIMINATE_DOWN),
        ]);
        if (!sfBack || !sfHint || !sfRefresh || !sfElim) {
            console.warn(
                '[GameView] 部分按钮贴图未加载成功；请确认 resources/icon 下存在对应 PNG，类型为 sprite-frame，且路径形如 icon/返回/spriteFrame',
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

        // 先建棋盘区域并置于最底层，避免全屏 BoardHolder 盖住顶栏、底栏
        const boardHolder = new Node('BoardHolder');
        boardHolder.setParent(root);
        const bhUt = boardHolder.addComponent(UITransform);
        const bhW = boardHolder.addComponent(Widget);
        bhW.isAlignTop = true;
        bhW.isAlignBottom = true;
        bhW.isAlignLeft = true;
        bhW.isAlignRight = true;
        // 上下边距对称，棋盘区域竖直中心与整屏一致；数值需 ≥ 顶栏/底栏占位 + 间隙
        const BAR_TOP = 88;
        const BAR_BOT = 100;
        const STRIP_GAP = 12;
        const SYMM_PAD = 50; // 上下各多 50，总高约少 100，且保持对称
        const edgeInset = Math.max(BAR_TOP + STRIP_GAP, BAR_BOT + STRIP_GAP) + SYMM_PAD;
        bhW.top = edgeInset;
        bhW.bottom = edgeInset;
        bhW.left = bhW.right = 24;
        bhW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bhW.updateAlignment();
        bhUt.setContentSize(vs.width - 48, vs.height - edgeInset * 2);

        addCenterFillRect(boardHolder, bhUt.width, bhUt.height, new Color(0x1b, 0x26, 0x3b, 255));

        const boardNode = new Node('Board');
        boardNode.setParent(boardHolder);
        const bUt = boardNode.addComponent(UITransform);
        const bW = boardNode.addComponent(Widget);
        bW.isAlignTop = bW.isAlignBottom = bW.isAlignLeft = bW.isAlignRight = true;
        // 与 BoardHolder 同大，避免内缩一圈形成「丑边框」
        bW.top = bW.bottom = bW.left = bW.right = 0;
        bW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bW.updateAlignment();
        bUt.setContentSize(bhUt.width, bhUt.height);

        this._board = boardNode.addComponent(LinkUpBoard);
        this._board.onWin = () => {
            this.beginOrRestartLevel(this._level + 1);
        };
        if (this._tileFaceCache && this._tileFaceCache.length > 0) {
            this._board.setTileFaceSprites(this._tileFaceCache);
        }

        boardHolder.setSiblingIndex(0);

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
            const btn = n.addComponent(Button);
            btn.target = n;
            this._mountSpriteButton(n, 200, 72, sf, sfDown, btn);
            n.on(Button.EventType.CLICK, handler, this);
        };

        mkTool('Hint', -220, sfHint, sfHint1, () => this._board?.showHint());
        mkTool('Refresh', 0, sfRefresh, sfRefresh1, () => this._board?.shuffleAll(true));
        mkTool('Eliminate', 220, sfElim, sfElim1, () => this._board?.removeTwoRandomTiles());
    }

    /**
     * 按钮贴图：普通态 + 按下态（`*1` 资源）；使用 SPRITE 过渡。
     * 无按下资源时用普通图代替；无普通图则纯色块 + NONE。
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
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = sfNormal;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.color = Color.WHITE;
        const press = sfPressed ?? sfNormal;
        btn.transition = Button.Transition.SPRITE;
        btn.normalSprite = sfNormal;
        btn.pressedSprite = press;
        btn.hoverSprite = sfNormal;
        btn.disabledSprite = sfNormal;
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
