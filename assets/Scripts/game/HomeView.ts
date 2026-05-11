import { _decorator, Button, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, Widget, view } from 'cc';
import { getLayoutSizeForNode } from '../util/ViewSize';
import { linkDumpNode, linkLog, nodePath } from '../util/LinkUpDebug';
import { getWhiteSpriteFrame } from '../util/WhiteSpriteFrame';

const { ccclass } = _decorator;

const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);

@ccclass('HomeView')
export class HomeView extends Component {
    private _onStart: (() => void) | null = null;
    private _bgSprite: Sprite | null = null;
    private _configuredBg: SpriteFrame | null = null;

    init(onStart: () => void) {
        this._onStart = onStart;
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

        const startNd = root.getChildByName('StartGame');
        if (startNd) {
            // 屏幕正中略偏下，逻辑简单；z 取正，保证在 Bg（若有）之上
            startNd.setPosition(0, -h * 0.15, 100);
        }

        if (bg) bg.setSiblingIndex(0);
        if (startNd) startNd.setSiblingIndex(Math.max(0, root.children.length - 1));

        linkLog('HomeView._layoutPanels', 'layout', {
            path: nodePath(this.node),
            layoutSize: { w, h },
            hasBg: !!bg,
            startLocal: startNd ? { x: startNd.position.x, y: startNd.position.y, z: startNd.position.z } : null,
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

        const startNode = new Node('StartGame');
        startNode.setParent(root);
        const sut = startNode.addComponent(UITransform);
        sut.setContentSize(420, 96);
        const sbtn = startNode.addComponent(Button);
        sbtn.transition = Button.Transition.NONE;
        sbtn.target = startNode;
        // 不用运行时 1×1 Texture 的 Sprite：在部分 Web/SCREEN_SPACE_CAMERA 组合下该 Sprite 不画出来，只见清屏色。
        const g = startNode.addComponent(Graphics);
        g.fillColor = C_BTN;
        g.fillRect(-210, -48, 420, 96);
        const sLabN = new Node('Label');
        sLabN.setParent(startNode);
        const sLab = sLabN.addComponent(Label);
        sLab.string = '开始游戏';
        sLab.color = Color.WHITE;
        sLab.fontSize = 34;
        sLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        sLab.verticalAlign = Label.VerticalAlign.CENTER;
        sLab.overflow = Label.Overflow.CLAMP;
        sLabN.addComponent(UITransform).setContentSize(420, 96);
        startNode.on(Button.EventType.CLICK, () => {
            linkLog('HomeView', 'StartGame CLICK');
            this._onStart?.();
        }, this);

        this._layoutPanels();

        linkLog('HomeView._buildUi', 'done（默认无全屏 Bg，白底来自 UICamera 清屏色）', {
            path: nodePath(this.node),
            childCount: root.children.length,
            childNames: root.children.map((c) => c.name),
        });
        linkDumpNode('HomeView._buildUi.StartGame', root.getChildByName('StartGame'));
    }
}
