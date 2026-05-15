import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Widget,
    view,
} from 'cc';
import { getLayoutSizeForNode } from '../util/ViewSize';
import { linkDumpNode, linkLog, nodePath } from '../util/LinkUpDebug';
import { getWhiteSpriteFrame } from '../util/WhiteSpriteFrame';

const { ccclass } = _decorator;

const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);

/** 首页主按钮贴图：由 GameApp 注入；未配置则用与项目样式一致的纯色底 + 文字 */
export type HomeMainButtonSprites = {
    startNormal: SpriteFrame | null;
    startPressed: SpriteFrame | null;
    deckNormal: SpriteFrame | null;
    deckPressed: SpriteFrame | null;
    shopNormal: SpriteFrame | null;
    shopPressed: SpriteFrame | null;
};

export type HomeViewInitOptions = {
    sprites: HomeMainButtonSprites;
    onStart: () => void;
    onDeck: () => void;
    onShop: () => void;
};

function addCenterFillRect(node: Node, w: number, h: number, fill: Color) {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
}

@ccclass('HomeView')
export class HomeView extends Component {
    private _opts: HomeViewInitOptions | null = null;
    private _bgSprite: Sprite | null = null;
    private _configuredBg: SpriteFrame | null = null;
    private _toastNode: Node | null = null;

    init(opts: HomeViewInitOptions) {
        this._opts = opts;
        if (!this.node.getChildByName('StartGame')) {
            this._buildUi();
        }
        this._layoutPanels();
    }

    /** 短暂提示（如无法开始游戏） */
    showToast(message: string, duration = 2.4) {
        if (this._toastNode?.isValid) this._toastNode.destroy();
        const root = this.node;
        const t = new Node('Toast');
        t.setParent(root);
        t.setSiblingIndex(root.children.length - 1);
        const tw = Math.min(560, getLayoutSizeForNode(root).width - 48);
        t.addComponent(UITransform).setContentSize(tw, 120);
        const w = t.addComponent(Widget);
        w.isAlignTop = true;
        w.isAlignHorizontalCenter = true;
        w.top = 120;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();
        addCenterFillRect(t, tw, 100, new Color(0x0d, 0x1b, 0x2a, 230));
        const labN = new Node('Msg');
        labN.setParent(t);
        labN.addComponent(UITransform).setContentSize(tw - 24, 88);
        const lab = labN.addComponent(Label);
        lab.string = message;
        lab.fontSize = 22;
        lab.color = Color.WHITE;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        this._toastNode = t;
        this.scheduleOnce(() => {
            if (t.isValid) t.destroy();
            if (this._toastNode === t) this._toastNode = null;
        }, duration);
    }

    /**
     * 仅当在编辑器为 GameApp 指定了 `homeBackground` 时才创建全屏 Bg（Sprite）。
     * 默认不建 Bg，避免全屏 Sprite 与按钮合批/深度导致「只见白底不见按钮」。
     */
    setConfiguredBackground(sf: SpriteFrame | null) {
        this._configuredBg = sf;
        if (!sf) {
            const old = this.node.getChildByName('Bg');
            if (old) {
                old.destroy();
                this._bgSprite = null;
                linkLog('HomeView.setConfiguredBackground', '已移除 Bg（无序列帧）');
            }
            return;
        }
        this._ensureBgNode();
        this._applyConfiguredBackground();
        this._layoutPanels();
    }

    private _ensureBgNode() {
        if (this._bgSprite) return;
        const root = this.node;
        const vs = getLayoutSizeForNode(this.node);
        const bgNode = new Node('Bg');
        bgNode.setParent(root);
        bgNode.setSiblingIndex(0);
        const bgUt = bgNode.addComponent(UITransform);
        const bgW = bgNode.addComponent(Widget);
        bgW.isAlignTop = bgW.isAlignBottom = bgW.isAlignLeft = bgW.isAlignRight = true;
        bgW.top = bgW.bottom = bgW.left = bgW.right = 0;
        bgW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bgW.updateAlignment();
        this._bgSprite = bgNode.addComponent(Sprite);
        this._bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgUt.setContentSize(vs.width, vs.height);
        linkLog('HomeView._ensureBgNode', '已创建全屏 Bg（因配置了 homeBackground）');
    }

    private _applyConfiguredBackground() {
        if (!this._bgSprite) return;
        if (this._configuredBg) {
            this._bgSprite.spriteFrame = this._configuredBg;
            this._bgSprite.color = Color.WHITE;
        } else {
            this._bgSprite.spriteFrame = getWhiteSpriteFrame();
            this._bgSprite.color = Color.WHITE;
        }
    }

    onLoad() {
        linkLog('HomeView.onLoad', 'begin', { path: nodePath(this.node) });
    }

    onEnable() {
        view.on('canvas-resize', this._layoutPanels, this);
        this._layoutPanels();
        this.scheduleOnce(this._layoutPanels, 0);
    }

    onDisable() {
        view.off('canvas-resize', this._layoutPanels, this);
    }

    start() {
        this._layoutPanels();
    }

    relayout() {
        this._layoutPanels();
    }

    private _layoutPanels = () => {
        const sz = getLayoutSizeForNode(this.node);
        const w = sz.width;
        const h = sz.height;
        const root = this.node;
        const rw = root.getComponent(UITransform);
        if (rw) rw.setContentSize(w, h);
        root.getComponent(Widget)?.updateAlignment();

        const bg = root.getChildByName('Bg');
        if (bg) {
            bg.setPosition(0, 0, -20);
            const ut = bg.getComponent(UITransform);
            if (ut) ut.setContentSize(w, h);
            bg.getComponent(Widget)?.updateAlignment();
        }

        const START_Y_OFFSET = -70;
        const startY = -h * 0.15 + START_Y_OFFSET;
        const startNd = root.getChildByName('StartGame');
        if (startNd) startNd.setPosition(0, startY, 100);

        const deckNd = root.getChildByName('BtnDeck');
        if (deckNd) deckNd.setPosition(-200, startY + 100, 100);

        const shopNd = root.getChildByName('BtnShop');
        if (shopNd) shopNd.setPosition(200, startY + 100, 100);

        if (bg) bg.setSiblingIndex(0);
        const topNames = ['Toast', 'DeckSelectModal', 'ShopModal'];
        let si = Math.max(0, root.children.length - 1);
        for (const name of ['StartGame', 'BtnDeck', 'BtnShop']) {
            const n = root.getChildByName(name);
            if (n) {
                n.setSiblingIndex(si);
                si = Math.max(0, n.getSiblingIndex() - 1);
            }
        }
        for (const name of topNames) {
            const n = root.getChildByName(name);
            if (n) n.setSiblingIndex(root.children.length - 1);
        }

        linkLog('HomeView._layoutPanels', 'layout', {
            path: nodePath(this.node),
            layoutSize: { w, h },
            hasBg: !!bg,
            children: root.children.map((c) => c.name),
        });
    };

    private _mountSpriteButton(
        node: Node,
        bw: number,
        bh: number,
        sfNormal: SpriteFrame | null,
        sfPressed: SpriteFrame | null,
        btn: Button,
    ) {
        if (!sfNormal) {
            addCenterFillRect(node, bw, bh, C_BTN);
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

    private _mkHomeButton(
        name: string,
        labelText: string,
        width: number,
        height: number,
        normal: SpriteFrame | null,
        pressed: SpriteFrame | null,
        onClick: () => void,
    ): Node {
        const n = new Node(name);
        n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(width, height);
        const btn = n.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        btn.target = n;
        if (!normal) {
            addCenterFillRect(n, width, height, C_BTN);
        } else {
            n.addComponent(Sprite);
        }
        this._mountSpriteButton(n, width, height, normal, pressed, btn);
        const sLabN = new Node('Label');
        sLabN.setParent(n);
        const sLab = sLabN.addComponent(Label);
        sLab.string = labelText;
        sLab.color = Color.WHITE;
        sLab.fontSize = 26;
        sLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        sLab.verticalAlign = Label.VerticalAlign.CENTER;
        sLab.overflow = Label.Overflow.CLAMP;
        sLabN.addComponent(UITransform).setContentSize(width, height);
        sLabN.active = !normal;
        n.on(Button.EventType.CLICK, () => {
            linkLog('HomeView', `${name} CLICK`);
            onClick();
        }, this);
        return n;
    }

    private _buildUi() {
        const root = this.node;
        const vs = getLayoutSizeForNode(this.node);
        const rw = root.addComponent(UITransform);
        rw.setContentSize(vs.width, vs.height);
        const w = root.addComponent(Widget);
        w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
        w.top = w.bottom = w.left = w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();

        const sp = this._opts?.sprites;
        const BW = 200;
        const BH = 72;

        this._mkHomeButton(
            'BtnDeck',
            '配置卡组',
            BW,
            BH,
            sp?.deckNormal ?? null,
            sp?.deckPressed ?? null,
            () => this._opts?.onDeck?.(),
        );
        this._mkHomeButton(
            'BtnShop',
            '商店',
            BW,
            BH,
            sp?.shopNormal ?? null,
            sp?.shopPressed ?? null,
            () => this._opts?.onShop?.(),
        );
        this._mkHomeButton(
            'StartGame',
            '开始游戏',
            420,
            96,
            sp?.startNormal ?? null,
            sp?.startPressed ?? null,
            () => this._opts?.onStart?.(),
        );

        this._layoutPanels();

        linkLog('HomeView._buildUi', 'done（默认无全屏 Bg，白底来自 UICamera 清屏色）', {
            path: nodePath(this.node),
            childCount: root.children.length,
            childNames: root.children.map((c) => c.name),
        });
        linkDumpNode('HomeView._buildUi.StartGame', root.getChildByName('StartGame'));
    }
}
