import { _decorator, Button, Color, Component, Label, Node, Sprite, SpriteFrame, UITransform, Widget, view } from 'cc';
import { loadImageUrlToSprite, pickLocalImageUrl } from '../util/ImageUploadHelper';
import { getLayoutSizeForNode } from '../util/ViewSize';
import { linkLog, nodePath } from '../util/LinkUpDebug';
import { createTintableWhiteSpriteFrame, getWhiteSpriteFrame } from '../util/WhiteSpriteFrame';

const { ccclass } = _decorator;

const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);

@ccclass('HomeView')
export class HomeView extends Component {
    private _onStart: (() => void) | null = null;
    private _bgSprite: Sprite | null = null;
    private _startSprite: Sprite | null = null;
    private _configuredBg: SpriteFrame | null = null;

    init(onStart: () => void) {
        this._onStart = onStart;
    }

    /** 由 GameApp 在 start 中传入编辑器配置的 SpriteFrame；未配置则为白底 */
    setConfiguredBackground(sf: SpriteFrame | null) {
        this._configuredBg = sf;
        this._applyConfiguredBackground();
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
        this._buildUi();
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
        this.scheduleOnce(this._layoutPanels, 0);
    }

    /** 供 GameApp 在同步 Canvas 尺寸后触发，避免 App 变大后底栏仍按旧高度计算 */
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
            bg.setPosition(0, 0, 0);
            const ut = bg.getComponent(UITransform);
            if (ut) ut.setContentSize(w, h);
            bg.getComponent(Widget)?.updateAlignment();
        }

        const bar = root.getChildByName('BottomBar');
        if (bar) {
            const ut = bar.getComponent(UITransform);
            if (ut) ut.setContentSize(w, 420);
            const barH = ut?.height ?? 420;
            const half = barH / 2;
            // z 略大，减少与全屏背景同批时顺序错乱；坐标仍以父锚点居中为准
            bar.setPosition(0, -h / 2 + 40 + half, 10);
        }

        if (bg) bg.setSiblingIndex(0);
        if (bar) bar.setSiblingIndex(Math.max(0, root.children.length - 1));

        const barPos = bar?.position;
        linkLog('HomeView._layoutPanels', 'layout', {
            path: nodePath(this.node),
            layoutSize: { w, h },
            bottomBarPos: barPos ? { x: barPos.x, y: barPos.y, z: barPos.z } : null,
            children: root.children.map((c) => c.name),
        });
    };

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

        const bgNode = new Node('Bg');
        bgNode.setParent(root);
        const bgUt = bgNode.addComponent(UITransform);
        const bgW = bgNode.addComponent(Widget);
        bgW.isAlignTop = bgW.isAlignBottom = bgW.isAlignLeft = bgW.isAlignRight = true;
        bgW.top = bgW.bottom = bgW.left = bgW.right = 0;
        bgW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bgW.updateAlignment();
        this._bgSprite = bgNode.addComponent(Sprite);
        this._bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgUt.setContentSize(vs.width, vs.height);
        this._applyConfiguredBackground();

        const bar = new Node('BottomBar');
        bar.setParent(root);
        const barUt = bar.addComponent(UITransform);
        barUt.setContentSize(vs.width, 420);
        // 底栏位置由 _layoutPanels 显式计算（避免仅依赖 Widget 时首帧落在屏外）

        const mkBtn = (text: string, y: number, handler: () => void) => {
            const n = new Node(text);
            n.setParent(bar);
            const ut = n.addComponent(UITransform);
            ut.setContentSize(520, 72);
            n.setPosition(0, y, 0);
            const btn = n.addComponent(Button);
            btn.transition = Button.Transition.COLOR;
            btn.normalColor = C_BTN;
            btn.target = n;
            const sp = n.addComponent(Sprite);
            sp.spriteFrame = createTintableWhiteSpriteFrame();
            sp.color = C_BTN;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const labN = new Node('Label');
            labN.setParent(n);
            const lab = labN.addComponent(Label);
            lab.string = text;
            lab.color = Color.WHITE;
            lab.fontSize = 26;
            lab.horizontalAlign = Label.HorizontalAlign.CENTER;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            lab.overflow = Label.Overflow.CLAMP;
            const lut = labN.addComponent(UITransform);
            lut.setContentSize(520, 72);
            n.on(Button.EventType.CLICK, handler, this);
            return n;
        };

        mkBtn('上传首页背景图', 120, () => void this._pickBg());
        mkBtn('上传开始按钮贴图', 30, () => void this._pickStartTex());

        const startNode = new Node('StartGame');
        startNode.setParent(bar);
        const sut = startNode.addComponent(UITransform);
        sut.setContentSize(420, 96);
        startNode.setPosition(0, -90, 0);
        const sbtn = startNode.addComponent(Button);
        sbtn.transition = Button.Transition.COLOR;
        sbtn.normalColor = C_BTN;
        sbtn.target = startNode;
        this._startSprite = startNode.addComponent(Sprite);
        this._startSprite.spriteFrame = createTintableWhiteSpriteFrame();
        this._startSprite.color = C_BTN;
        this._startSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const sLabN = new Node('Label');
        sLabN.setParent(startNode);
        const sLab = sLabN.addComponent(Label);
        sLab.string = '开始游戏';
        sLab.color = Color.WHITE;
        sLab.fontSize = 34;
        sLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        sLab.verticalAlign = Label.VerticalAlign.CENTER;
        sLab.overflow = Label.Overflow.CLAMP;
        const slut = sLabN.addComponent(UITransform);
        slut.setContentSize(420, 96);
        startNode.on(Button.EventType.CLICK, () => this._onStart?.(), this);

        this._layoutPanels();

        const bottomBar = root.getChildByName('BottomBar');
        const startNd = bottomBar?.getChildByName('StartGame');
        linkLog('HomeView._buildUi', 'done', {
            path: nodePath(this.node),
            hasBg: !!root.getChildByName('Bg'),
            hasBottomBar: !!bottomBar,
            barChildCount: bottomBar?.children.length,
            startBtn: startNd
                ? {
                      pos: { x: startNd.position.x, y: startNd.position.y },
                      active: startNd.active,
                  }
                : null,
        });
    }

    private async _pickBg() {
        try {
            const url = await pickLocalImageUrl();
            if (this._bgSprite) {
                await loadImageUrlToSprite(this._bgSprite, url);
                this._bgSprite.color = Color.WHITE;
            }
        } catch {
            // 用户取消或环境不支持
        }
    }

    private async _pickStartTex() {
        try {
            const url = await pickLocalImageUrl();
            if (this._startSprite) {
                await loadImageUrlToSprite(this._startSprite, url);
                this._startSprite.color = Color.WHITE;
            }
        } catch {
            // ignore
        }
    }
}
