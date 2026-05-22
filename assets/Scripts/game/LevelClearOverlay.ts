import {
    _decorator,
    BlockInputEvents,
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
} from 'cc';
import {
    applyDialogPanelBackground,
    applyLabelBlackOutline,
    mkDialogPanelShell,
} from '../util/DialogPanelBg';
import { mkDialogActionButton, type DialogActionButtonSprites } from '../util/DialogActionButtons';

const { ccclass } = _decorator;

const C_DIM = new Color(0, 0, 0, 160);
const C_TITLE = new Color(0xe9, 0xc4, 0x6a, 255);
const C_BODY = new Color(0xe0, 0xe1, 0xdd, 255);

export type LevelClearDialogConfig = {
    panelBg: SpriteFrame | null;
    coinIcon: SpriteFrame | null;
    animFrames: SpriteFrame[];
    animFps: number;
    actionButtons: DialogActionButtonSprites | null;
};

export type LevelClearOpenOptions = {
    level: number;
    coinAmount: number;
    onHome: () => void;
    onNext: () => void;
};

function fullSize(root: Node): { w: number; h: number } {
    const ut = root.getComponent(UITransform);
    return {
        w: ut && ut.width > 1 ? ut.width : 720,
        h: ut && ut.height > 1 ? ut.height : 1280,
    };
}

@ccclass('LevelClearCelebration')
class LevelClearCelebration extends Component {
    private _frames: SpriteFrame[] = [];
    private _fps = 12;
    private _idx = 0;
    private _sprite: Sprite | null = null;

    setup(frames: SpriteFrame[], fps: number) {
        this._frames = frames.filter((f) => !!f);
        this._fps = Math.max(1, fps);
    }

    onLoad() {
        if (this._frames.length === 0) {
            this.node.active = false;
            return;
        }
        const ut = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        const first = this._frames[0];
        const r = first.rect;
        const fw = Math.max(1, r.width);
        const fh = Math.max(1, r.height);
        const maxSide = Math.min(ut.width > 1 ? ut.width : 400, ut.height > 1 ? ut.height : 400);
        const scale = Math.min(1, maxSide / Math.max(fw, fh));
        ut.setContentSize(fw * scale, fh * scale);

        this._sprite = this.node.getComponent(Sprite) ?? this.node.addComponent(Sprite);
        this._sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._sprite.spriteFrame = first;
        this._sprite.color = Color.WHITE;

        this.schedule(this._tick, 1 / this._fps);
    }

    onDestroy() {
        this.unschedule(this._tick);
    }

    private _tick = () => {
        if (!this._sprite?.isValid || this._frames.length === 0) return;
        this._idx = (this._idx + 1) % this._frames.length;
        this._sprite.spriteFrame = this._frames[this._idx];
    };
}

/** 通关结算：上半屏循环动画（在弹窗下层）+ 居中弹窗 + 返回首页 / 下一关 */
export function openLevelClearOverlay(
    gameRoot: Node,
    cfg: LevelClearDialogConfig | null,
    opts: LevelClearOpenOptions,
    host: Component,
): () => void {
    const prevRoot = gameRoot.getChildByName('LevelClearRoot');
    prevRoot?.destroy();

    const { w, h } = fullSize(gameRoot);
    const panelW = w * (2 / 3);
    const panelH = h * 0.5;
    const btnW = 148;
    const btnH = 48;
    const btnGap = 24;

    const root = new Node('LevelClearRoot');
    root.setParent(gameRoot);
    root.setSiblingIndex(gameRoot.children.length - 1);
    root.addComponent(UITransform).setContentSize(w, h);
    const rootWg = root.addComponent(Widget);
    rootWg.isAlignTop = rootWg.isAlignBottom = rootWg.isAlignLeft = rootWg.isAlignRight = true;
    rootWg.top = rootWg.bottom = rootWg.left = rootWg.right = 0;
    rootWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    rootWg.updateAlignment();

    const dim = new Node('Dim');
    dim.setParent(root);
    dim.addComponent(UITransform).setContentSize(w, h);
    const dimWg = dim.addComponent(Widget);
    dimWg.isAlignTop = dimWg.isAlignBottom = dimWg.isAlignLeft = dimWg.isAlignRight = true;
    dimWg.top = dimWg.bottom = dimWg.left = dimWg.right = 0;
    dimWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    dimWg.updateAlignment();
    dim.addComponent(BlockInputEvents);
    const dimG = dim.addComponent(Graphics);
    dimG.fillColor = C_DIM;
    dimG.fillRect(-w / 2, -h / 2, w, h);

    const frames = cfg?.animFrames?.filter((f) => !!f) ?? [];
    if (frames.length > 0) {
        const cele = new Node('LevelClearCelebration');
        cele.setParent(root);
        cele.addComponent(UITransform).setContentSize(w, h * 0.5);
        const cWg = cele.addComponent(Widget);
        cWg.isAlignTop = cWg.isAlignLeft = cWg.isAlignRight = true;
        cWg.isAlignHorizontalCenter = true;
        cWg.top = 0;
        cWg.bottom = h * 0.5;
        cWg.left = cWg.right = 0;
        cWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        cWg.updateAlignment();

        const animN = new Node('Anim');
        animN.setParent(cele);
        const aUt = animN.addComponent(UITransform);
        aUt.setContentSize(Math.min(w * 0.85, 520), h * 0.42);
        const aWg = animN.addComponent(Widget);
        aWg.isAlignHorizontalCenter = true;
        aWg.isAlignVerticalCenter = true;
        aWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        aWg.updateAlignment();

        const celeComp = animN.addComponent(LevelClearCelebration);
        celeComp.setup(frames, cfg?.animFps ?? 12);
    }

    const panel = mkDialogPanelShell(root, panelW, panelH);
    applyDialogPanelBackground(panel, panelW, panelH, cfg?.panelBg ?? null);

    const titleN = new Node('Title');
    titleN.setParent(panel);
    titleN.setPosition(0, panelH * 0.28, 0);
    titleN.addComponent(UITransform).setContentSize(panelW - 40, 40);
    const tl = titleN.addComponent(Label);
    tl.string = '通关结算';
    tl.fontSize = 30;
    tl.color = C_TITLE;
    tl.horizontalAlign = Label.HorizontalAlign.CENTER;
    tl.verticalAlign = Label.VerticalAlign.CENTER;
    applyLabelBlackOutline(tl);

    const lvlN = new Node('Level');
    lvlN.setParent(panel);
    lvlN.setPosition(0, panelH * 0.12, 0);
    lvlN.addComponent(UITransform).setContentSize(panelW - 48, 36);
    const ll = lvlN.addComponent(Label);
    ll.string = `第 ${opts.level} 关 通关`;
    ll.fontSize = 24;
    ll.color = C_BODY;
    ll.horizontalAlign = Label.HorizontalAlign.CENTER;
    ll.verticalAlign = Label.VerticalAlign.CENTER;
    applyLabelBlackOutline(ll);

    const rowY = -panelH * 0.06;
    if (opts.coinAmount > 0) {
        if (cfg?.coinIcon) {
            const iconN = new Node('CoinIcon');
            iconN.setParent(panel);
            iconN.setPosition(-72, rowY, 0);
            const r = cfg.coinIcon.rect;
            const uw = Math.max(1, r.width);
            const uh = Math.max(1, r.height);
            iconN.addComponent(UITransform).setContentSize(uw, uh);
            const isp = iconN.addComponent(Sprite);
            isp.spriteFrame = cfg.coinIcon;
            isp.sizeMode = Sprite.SizeMode.TRIMMED;
            const s = Math.min(44 / uw, 44 / uh);
            iconN.setScale(s, s, 1);
        }
        const amtN = new Node('CoinAmt');
        amtN.setParent(panel);
        amtN.setPosition(cfg?.coinIcon ? 16 : 0, rowY, 0);
        amtN.addComponent(UITransform).setContentSize(panelW - 56, 40);
        const al = amtN.addComponent(Label);
        al.string = `+${opts.coinAmount} 金币`;
        al.fontSize = 26;
        al.color = C_TITLE;
        al.horizontalAlign = Label.HorizontalAlign.CENTER;
        al.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(al);
    }

    const subN = new Node('Sub');
    subN.setParent(panel);
    subN.setPosition(0, -panelH * 0.16, 0);
    subN.addComponent(UITransform).setContentSize(panelW - 48, 28);
    const sl = subN.addComponent(Label);
    sl.string =
        opts.coinAmount > 0
            ? `本关连线 ${opts.coinAmount} 次`
            : '本关未获得金币奖励';
    sl.fontSize = 18;
    sl.color = C_BODY;
    sl.horizontalAlign = Label.HorizontalAlign.CENTER;
    sl.verticalAlign = Label.VerticalAlign.CENTER;

    const btnY = -panelH * 0.34;
    const halfSpan = btnW + btnGap * 0.5;
    const sprites = cfg?.actionButtons ?? null;

    const closeAll = () => {
        if (root.isValid) root.destroy();
    };

    mkDialogActionButton(
        panel,
        -halfSpan,
        btnY,
        'cancel',
        '返回首页',
        sprites,
        () => {
            closeAll();
            opts.onHome();
        },
        host,
        btnW,
        btnH,
    );

    mkDialogActionButton(
        panel,
        halfSpan,
        btnY,
        'ok',
        '下一关',
        sprites,
        () => {
            closeAll();
            opts.onNext();
        },
        host,
        btnW,
        btnH,
    );

    return closeAll;
}
