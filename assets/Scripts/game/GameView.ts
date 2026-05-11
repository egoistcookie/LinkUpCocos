import { _decorator, Button, Color, Component, Label, Node, Sprite, UITransform, Widget, view } from 'cc';
import { LinkUpBoard } from './LinkUpBoard';
import { getWhiteSpriteFrame } from '../util/WhiteSpriteFrame';

const { ccclass } = _decorator;

const C_BAR = new Color(0x0d, 0x1b, 0x2a, 220);
const C_BTN = new Color(0x41, 0x5a, 0x77, 255);

@ccclass('GameView')
export class GameView extends Component {
    private _level = 1;
    private _levelLabel: Label | null = null;
    private _board: LinkUpBoard | null = null;

    onBack: (() => void) | null = null;

    onLoad() {
        this._buildUi();
    }

    beginOrRestartLevel(level: number) {
        this._level = level;
        if (this._levelLabel) this._levelLabel.string = `第 ${this._level} 关`;
        this.scheduleOnce(() => {
            this._board?.buildLevel();
            this._board?.resizeToParent();
        }, 0);
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
        const topBg = top.addComponent(Sprite);
        topBg.spriteFrame = getWhiteSpriteFrame();
        topBg.color = C_BAR;
        topBg.sizeMode = Sprite.SizeMode.CUSTOM;

        const lvlN = new Node('Level');
        lvlN.setParent(top);
        const ll = lvlN.addComponent(Label);
        ll.string = `第 ${this._level} 关`;
        ll.color = new Color(0xe0, 0xe1, 0xdd, 255);
        ll.fontSize = 28;
        lvlN.addComponent(UITransform).setContentSize(300, 60);
        lvlN.setPosition(-140, 0, 0);
        this._levelLabel = ll;

        const backN = new Node('Back');
        backN.setParent(top);
        backN.addComponent(UITransform).setContentSize(160, 64);
        backN.setPosition(200, 0, 0);
        const bbtn = backN.addComponent(Button);
        bbtn.transition = Button.Transition.COLOR;
        bbtn.normalColor = C_BTN;
        bbtn.target = backN;
        const bsp = backN.addComponent(Sprite);
        bsp.spriteFrame = getWhiteSpriteFrame();
        bsp.color = C_BTN;
        bsp.sizeMode = Sprite.SizeMode.CUSTOM;
        const bl = new Node('L');
        bl.setParent(backN);
        const blab = bl.addComponent(Label);
        blab.string = '返回首页';
        blab.color = Color.WHITE;
        blab.fontSize = 22;
        bl.addComponent(UITransform).setContentSize(160, 64);
        backN.on(Button.EventType.CLICK, () => this.onBack?.(), this);

        const boardHolder = new Node('BoardHolder');
        boardHolder.setParent(root);
        const bhUt = boardHolder.addComponent(UITransform);
        const bhW = boardHolder.addComponent(Widget);
        bhW.isAlignTop = true;
        bhW.isAlignBottom = true;
        bhW.isAlignLeft = true;
        bhW.isAlignRight = true;
        bhW.top = 100;
        bhW.bottom = 120;
        bhW.left = bhW.right = 24;
        bhW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bhW.updateAlignment();
        bhUt.setContentSize(vs.width - 48, vs.height - 220);

        const boardBg = boardHolder.addComponent(Sprite);
        boardBg.spriteFrame = getWhiteSpriteFrame();
        boardBg.color = new Color(0x1b, 0x26, 0x3b, 255);
        boardBg.sizeMode = Sprite.SizeMode.CUSTOM;

        const boardNode = new Node('Board');
        boardNode.setParent(boardHolder);
        const bUt = boardNode.addComponent(UITransform);
        const bW = boardNode.addComponent(Widget);
        bW.isAlignTop = bW.isAlignBottom = bW.isAlignLeft = bW.isAlignRight = true;
        bW.top = bW.bottom = bW.left = bW.right = 8;
        bW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        bW.updateAlignment();
        bUt.setContentSize(bhUt.width - 16, bhUt.height - 16);

        this._board = boardNode.addComponent(LinkUpBoard);
        this._board.onWin = () => {
            this.beginOrRestartLevel(this._level + 1);
        };

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

        const mkTool = (text: string, x: number, handler: () => void) => {
            const n = new Node(text);
            n.setParent(bottom);
            n.addComponent(UITransform).setContentSize(200, 72);
            n.setPosition(x, 8, 0);
            const btn = n.addComponent(Button);
            btn.transition = Button.Transition.COLOR;
            btn.normalColor = C_BTN;
            btn.target = n;
            const sp = n.addComponent(Sprite);
            sp.spriteFrame = getWhiteSpriteFrame();
            sp.color = C_BTN;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const ln = new Node('L');
            ln.setParent(n);
            const lab = ln.addComponent(Label);
            lab.string = text;
            lab.color = Color.WHITE;
            lab.fontSize = 22;
            ln.addComponent(UITransform).setContentSize(200, 72);
            n.on(Button.EventType.CLICK, handler, this);
        };

        mkTool('提示', -220, () => this._board?.showHint());
        mkTool('刷新', 0, () => this._board?.shuffleAll(true));
        mkTool('消除随机', 220, () => this._board?.removeTwoRandomTiles());
    }

    onEnable() {
        this.scheduleOnce(() => {
            this._board?.resizeToParent();
        }, 0);
    }
}
