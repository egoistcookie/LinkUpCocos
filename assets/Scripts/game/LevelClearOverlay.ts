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
    mkDialogPanelShell,
} from '../util/DialogPanelBg';

const { ccclass } = _decorator;

const C_DIM = new Color(0, 0, 0, 160);
const C_TITLE = new Color(0xe9, 0xc4, 0x6a, 255);
const C_BTN_HOME = new Color(0x41, 0x5a, 0x77, 255);
const C_BTN_NEXT = new Color(0x2d, 0x6a, 0x4f, 255);
/** 「本关连线」「次」暖棕色（略提亮） */
const C_ROUND_TEXT = new Color(0x98, 0x75, 0x48, 255);
/** 连线次数数字：灰绿色（略提亮） */
const C_ROUND_NUM = new Color(0x82, 0xa8, 0x82, 255);
const C_ROUND_OUTLINE = new Color(0x6a, 0x52, 0x38, 255);
const ROUND_FONT_FAMILY = 'YouYuan, Yuanti SC, STYuanti-SC-Regular, PingFang SC, sans-serif';
const ROUND_FONT_SIZE = 26;
const ROUND_NUM_FONT_SIZE = 30;
/** 「本关连线」四字之间的额外字距 */
const ROUND_CHAR_GAP = 6;

export type LevelClearButtonSprites = {
    homeNormal: SpriteFrame | null;
    homePressed: SpriteFrame | null;
    nextNormal: SpriteFrame | null;
    nextPressed: SpriteFrame | null;
};

export type LevelClearDialogConfig = {
    panelBg: SpriteFrame | null;
    coinIcon: SpriteFrame | null;
    animFrames: SpriteFrame[];
    animFps: number;
    buttons: LevelClearButtonSprites | null;
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

function btnSizeFromSprite(sf: SpriteFrame | null, defaultW: number, defaultH: number) {
    if (!sf) return { w: defaultW, h: defaultH };
    const r = sf.rect;
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
}

function applyRoundLabelStyle(lab: Label, color: Color, fontSize: number) {
    lab.useSystemFont = true;
    lab.fontFamily = ROUND_FONT_FAMILY;
    lab.isBold = true;
    lab.fontSize = fontSize;
    lab.color = color;
    lab.enableOutline = true;
    lab.outlineColor = C_ROUND_OUTLINE;
    lab.outlineWidth = 2;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
}

function mkRoundLabel(parent: Node, text: string, color: Color, fontSize: number): Node {
    const n = new Node('Part');
    n.setParent(parent);
    const estW = Math.max(fontSize, Math.ceil(text.length * fontSize * 0.92));
    n.addComponent(UITransform).setContentSize(estW, fontSize + 12);
    const lab = n.addComponent(Label);
    lab.string = text;
    applyRoundLabelStyle(lab, color, fontSize);
    return n;
}

/** 「本关连线」+ 数字 +「次」，圆体、棕/绿分色 */
function mkConnectCountRow(parent: Node, x: number, y: number, count: number) {
    const row = new Node('ConnectCount');
    row.setParent(parent);
    row.setPosition(x, y, 0);

    const chars = ['本', '关', '连', '线'];
    const num = `${count}`;
    const charW = ROUND_FONT_SIZE * 0.92;
    const numW = num.length * ROUND_NUM_FONT_SIZE * 0.62;
    const sufW = ROUND_FONT_SIZE * 0.92;
    const secGap = 10;
    const midGap = ROUND_CHAR_GAP;
    const totalW =
        chars.length * charW +
        (chars.length - 1) * ROUND_CHAR_GAP +
        secGap +
        numW +
        midGap +
        sufW;

    let cx = -totalW / 2;
    for (const ch of chars) {
        const n = mkRoundLabel(row, ch, C_ROUND_TEXT, ROUND_FONT_SIZE);
        n.setPosition(cx + charW / 2, 0, 0);
        cx += charW + ROUND_CHAR_GAP;
    }
    cx += secGap - ROUND_CHAR_GAP;

    const numN = mkRoundLabel(row, num, C_ROUND_NUM, ROUND_NUM_FONT_SIZE);
    numN.setPosition(cx + numW / 2, 0, 0);
    cx += numW + midGap;

    const sufN = mkRoundLabel(row, '次', C_ROUND_TEXT, ROUND_FONT_SIZE);
    sufN.setPosition(cx + sufW / 2, 0, 0);
}

function mountLevelClearSpriteButton(
    node: Node,
    sfNormal: SpriteFrame,
    sfPressed: SpriteFrame | null,
) {
    const sp = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sp.spriteFrame = sfNormal;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = Color.WHITE;
    const pressSf = sfPressed ?? sfNormal;
    const toNormal = () => {
        if (sp.isValid) sp.spriteFrame = sfNormal;
    };
    const toPress = () => {
        if (sp.isValid) sp.spriteFrame = pressSf;
    };
    node.on(Node.EventType.TOUCH_START, toPress, node);
    node.on(Node.EventType.TOUCH_END, toNormal, node);
    node.on(Node.EventType.TOUCH_CANCEL, toNormal, node);
}

function mkLevelClearButton(
    parent: Node,
    x: number,
    y: number,
    name: string,
    sfNormal: SpriteFrame | null,
    sfPressed: SpriteFrame | null,
    fallbackFill: Color,
    onClick: () => void,
    host: Component,
    defaultW: number,
    defaultH: number,
): Node {
    const { w, h } = btnSizeFromSprite(sfNormal, defaultW, defaultH);
    const n = new Node(name);
    n.setParent(parent);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(w, h);

    if (sfNormal) {
        mountLevelClearSpriteButton(n, sfNormal, sfPressed);
    } else {
        const g = n.addComponent(Graphics);
        g.fillColor = fallbackFill;
        g.fillRect(-w / 2, -h / 2, w, h);
    }

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    n.on(Button.EventType.CLICK, onClick, host);
    return n;
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

    const coinBaseY = -panelH * 0.06;
    if (opts.coinAmount > 0) {
        const amtN = new Node('CoinAmt');
        amtN.setParent(panel);
        amtN.setPosition(55, coinBaseY + 137, 0);
        amtN.addComponent(UITransform).setContentSize(panelW - 56, 40);
        const al = amtN.addComponent(Label);
        al.string = `+${opts.coinAmount} 金币`;
        al.fontSize = 31;
        al.color = C_TITLE;
        al.horizontalAlign = Label.HorizontalAlign.CENTER;
        al.verticalAlign = Label.VerticalAlign.CENTER;
        al.enableOutline = true;
        al.outlineColor = Color.BLACK;
        al.outlineWidth = 2;
    }

    mkConnectCountRow(panel, 50, -panelH * 0.16 + 68, opts.coinAmount);

    const btnY = -panelH * 0.34;
    const buttons = cfg?.buttons ?? null;
    const homeSize = btnSizeFromSprite(buttons?.homeNormal ?? null, btnW, btnH);
    const nextSize = btnSizeFromSprite(buttons?.nextNormal ?? null, btnW, btnH);
    const totalBtnW = homeSize.w + btnGap + nextSize.w;
    const homeX = -totalBtnW / 2 + homeSize.w / 2;
    const nextX = totalBtnW / 2 - nextSize.w / 2;

    const closeAll = () => {
        if (root.isValid) root.destroy();
    };

    mkLevelClearButton(
        panel,
        homeX,
        btnY,
        'BtnHome',
        buttons?.homeNormal ?? null,
        buttons?.homePressed ?? null,
        C_BTN_HOME,
        () => {
            closeAll();
            opts.onHome();
        },
        host,
        btnW,
        btnH,
    );

    mkLevelClearButton(
        panel,
        nextX,
        btnY,
        'BtnNext',
        buttons?.nextNormal ?? null,
        buttons?.nextPressed ?? null,
        C_BTN_NEXT,
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
