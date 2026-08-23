import {
    BlockInputEvents,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
    easing,
    tween,
} from 'cc';
import { loadCubeSpriteByName } from '../util/CubeShopLoader';

const C_DIM = new Color(0, 0, 0, 180);
const C_TITLE = new Color(0xe9, 0xc4, 0x6a, 255);
const C_TITLE_OUTLINE = new Color(0x3a, 0x2a, 0x18, 255);
const C_HINT = new Color(0xe0, 0xe1, 0xdd, 255);
const C_CUBE_FALLBACK = new Color(0x41, 0x5a, 0x77, 255);

const ENTER_FADE = 0.35;
const DISMISS_FADE = 0.4;
/** 方块展示边长约占屏宽比例 */
const CUBE_SIZE_RATIO = 0.42;

function fullSize(root: Node): { w: number; h: number } {
    const ut = root.getComponent(UITransform);
    return {
        w: ut && ut.width > 1 ? ut.width : 720,
        h: ut && ut.height > 1 ? ut.height : 1280,
    };
}

/**
 * 翻牌消散后的史诗方块奖励页：上方提示「获得史诗方块」，下方展示对应 cube 贴图；
 * 再次点击后进入结算。返回关闭函数。
 */
export function openEpicCubeRewardOverlay(
    gameRoot: Node,
    host: Component,
    cubeId: string,
    onFinished: () => void,
): () => void {
    const prev = gameRoot.getChildByName('EpicCubeRewardRoot');
    prev?.destroy();

    const id = String(cubeId ?? '').trim();
    const { w, h } = fullSize(gameRoot);
    const cubeSize = Math.min(w * CUBE_SIZE_RATIO, h * 0.36);

    const root = new Node('EpicCubeRewardRoot');
    root.setParent(gameRoot);
    root.setSiblingIndex(gameRoot.children.length - 1);
    root.addComponent(UITransform).setContentSize(w, h);
    const rootWg = root.addComponent(Widget);
    rootWg.isAlignTop = rootWg.isAlignBottom = rootWg.isAlignLeft = rootWg.isAlignRight = true;
    rootWg.top = rootWg.bottom = rootWg.left = rootWg.right = 0;
    rootWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    rootWg.updateAlignment();
    const rootOp = root.addComponent(UIOpacity);
    rootOp.opacity = 0;

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

    const title = new Node('Title');
    title.setParent(root);
    title.setPosition(0, cubeSize * 0.5 + 72, 0);
    title.addComponent(UITransform).setContentSize(w * 0.9, 56);
    const titleLab = title.addComponent(Label);
    titleLab.string = '获得史诗方块';
    titleLab.useSystemFont = true;
    titleLab.fontFamily = 'YouYuan, Yuanti SC, STYuanti-SC-Regular, PingFang SC, sans-serif';
    titleLab.isBold = true;
    titleLab.fontSize = 34;
    titleLab.color = C_TITLE;
    titleLab.enableOutline = true;
    titleLab.outlineColor = C_TITLE_OUTLINE;
    titleLab.outlineWidth = 2;
    titleLab.horizontalAlign = Label.HorizontalAlign.CENTER;
    titleLab.verticalAlign = Label.VerticalAlign.CENTER;

    const cubeRoot = new Node('Cube');
    cubeRoot.setParent(root);
    cubeRoot.setPosition(0, -8, 0);
    cubeRoot.setScale(0.72, 0.72, 1);
    cubeRoot.addComponent(UITransform).setContentSize(cubeSize, cubeSize);
    const cubeOp = cubeRoot.addComponent(UIOpacity);
    cubeOp.opacity = 0;

    const face = new Node('Face');
    face.setParent(cubeRoot);
    face.addComponent(UITransform).setContentSize(cubeSize, cubeSize);
    const sp = face.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = Color.WHITE;
    sp.enabled = false;

    const fallback = face.addComponent(Graphics);
    fallback.fillColor = C_CUBE_FALLBACK;
    const rr = Math.min(16, cubeSize * 0.08);
    fallback.roundRect(-cubeSize / 2, -cubeSize / 2, cubeSize, cubeSize, rr);
    fallback.fill();

    const hint = new Node('Hint');
    hint.setParent(root);
    hint.setPosition(0, -cubeSize * 0.5 - 64, 0);
    hint.addComponent(UITransform).setContentSize(w * 0.9, 40);
    const hintLab = hint.addComponent(Label);
    hintLab.string = '点击继续';
    hintLab.useSystemFont = true;
    hintLab.fontFamily = 'YouYuan, Yuanti SC, STYuanti-SC-Regular, PingFang SC, sans-serif';
    hintLab.fontSize = 24;
    hintLab.color = C_HINT;
    hintLab.horizontalAlign = Label.HorizontalAlign.CENTER;
    hintLab.verticalAlign = Label.VerticalAlign.CENTER;
    const hintOp = hint.addComponent(UIOpacity);
    hintOp.opacity = 0;

    let closed = false;
    let ready = false;
    let dismissing = false;

    const closeAll = () => {
        if (closed) return;
        closed = true;
        if (root.isValid) {
            Tween.stopAllByTarget(root);
            Tween.stopAllByTarget(cubeRoot);
            const op = root.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            const cop = cubeRoot.getComponent(UIOpacity);
            if (cop) Tween.stopAllByTarget(cop);
            root.destroy();
        }
    };

    const applySprite = (sf: SpriteFrame | null) => {
        if (!face.isValid) return;
        if (!sf) return;
        sp.spriteFrame = sf;
        sp.enabled = true;
        fallback.enabled = false;
        const r = sf.rect;
        const uw = Math.max(1, r.width);
        const uh = Math.max(1, r.height);
        const scale = Math.min(cubeSize / uw, cubeSize / uh);
        face.getComponent(UITransform)?.setContentSize(uw, uh);
        face.setScale(scale, scale, 1);
    };

    const dismissAndContinue = () => {
        if (closed || !ready || dismissing) return;
        dismissing = true;
        dim.off(Node.EventType.TOUCH_END);
        tween(hintOp).to(0.18, { opacity: 0 }, { easing: easing.sineOut }).start();
        tween(rootOp)
            .to(DISMISS_FADE, { opacity: 0 }, { easing: easing.sineIn })
            .call(() => {
                if (closed) return;
                closeAll();
                onFinished();
            })
            .start();
    };

    const enterReady = () => {
        if (closed || ready) return;
        ready = true;
        dim.on(Node.EventType.TOUCH_END, dismissAndContinue, host);
        tween(hintOp).to(0.28, { opacity: 255 }, { easing: easing.sineOut }).start();
    };

    const playEnter = () => {
        if (closed || !root.isValid) return;
        tween(rootOp).to(ENTER_FADE, { opacity: 255 }, { easing: easing.sineOut }).start();
        tween(cubeOp).to(ENTER_FADE, { opacity: 255 }, { easing: easing.sineOut }).start();
        tween(cubeRoot)
            .to(0.42, { scale: new Vec3(1, 1, 1) }, { easing: easing.backOut })
            .call(() => enterReady())
            .start();
    };

    if (id) {
        loadCubeSpriteByName(id, (sf) => {
            if (closed || !root.isValid) return;
            applySprite(sf);
            playEnter();
        });
    } else {
        playEnter();
    }

    return closeAll;
}
