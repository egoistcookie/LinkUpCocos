import { _decorator, Button, Color, Component, Label, Node, Sprite, UITransform, Widget, view } from 'cc';
import { loadImageUrlToSprite, pickLocalImageUrl } from '../util/ImageUploadHelper';
import { getWhiteSpriteFrame } from '../util/WhiteSpriteFrame';

const { ccclass } = _decorator;

const C_BG = new Color(0x1a, 0x3a, 0x52, 255);
const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);

@ccclass('HomeView')
export class HomeView extends Component {
    private _onStart: (() => void) | null = null;
    private _bgSprite: Sprite | null = null;
    private _startSprite: Sprite | null = null;

    init(onStart: () => void) {
        this._onStart = onStart;
    }

    onLoad() {
        this._buildUi();
    }

    private _buildUi() {
        const root = this.node;
        const vs = view.getVisibleSize();
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
        this._bgSprite.spriteFrame = getWhiteSpriteFrame();
        this._bgSprite.color = C_BG;
        this._bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgUt.setContentSize(vs.width, vs.height);

        const bar = new Node('BottomBar');
        bar.setParent(root);
        const barUt = bar.addComponent(UITransform);
        barUt.setContentSize(vs.width, 420);
        const barW = bar.addComponent(Widget);
        barW.isAlignBottom = true;
        barW.isAlignLeft = true;
        barW.isAlignRight = true;
        barW.bottom = 40;
        barW.left = barW.right = 0;
        barW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        barW.updateAlignment();

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
            sp.spriteFrame = getWhiteSpriteFrame();
            sp.color = C_BTN;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const labN = new Node('Label');
            labN.setParent(n);
            const lab = labN.addComponent(Label);
            lab.string = text;
            lab.color = Color.WHITE;
            lab.fontSize = 26;
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
        this._startSprite.spriteFrame = getWhiteSpriteFrame();
        this._startSprite.color = C_BTN;
        this._startSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const sLabN = new Node('Label');
        sLabN.setParent(startNode);
        const sLab = sLabN.addComponent(Label);
        sLab.string = '开始游戏';
        sLab.color = Color.WHITE;
        sLab.fontSize = 34;
        const slut = sLabN.addComponent(UITransform);
        slut.setContentSize(420, 96);
        startNode.on(Button.EventType.CLICK, () => this._onStart?.(), this);
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
