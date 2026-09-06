import {
    BlockInputEvents,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    Tween,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
    Widget,
    easing,
    resources,
    tween,
} from 'cc';
import { loadTarotCardByCubeId } from '../util/TarotPool';

const C_DIM = new Color(0, 0, 0, 180);
const C_HINT = new Color(0xe9, 0xc4, 0x6a, 255);
const C_HINT_OUTLINE = new Color(0x3a, 0x2a, 0x18, 255);
const C_CARD_FALLBACK = new Color(0x2b, 0x1d, 0x3a, 255);

const TALO_BACK = 'talo/塔罗牌-背面';

/** 与通关抽卡一致：原图 200:375 = 2:3.75 */
const CARD_ASPECT_H_OVER_W = 3.75 / 2;
/** 单张预览约占屏宽（再放大至约 150%） */
const CARD_WIDTH_RATIO = 0.63;

const FLIP_HALF = 0.36;
const MOVE_CENTER_DUR = FLIP_HALF * 2;
const DISMISS_FADE = 0.45;

function fullSize(root: Node): { w: number; h: number } {
    const ut = root.getComponent(UITransform);
    return {
        w: ut && ut.width > 1 ? ut.width : 720,
        h: ut && ut.height > 1 ? ut.height : 1280,
    };
}

function loadResourcesSpriteFrame(basePath: string): Promise<SpriteFrame | null> {
    return new Promise((resolve) => {
        resources.load(`${basePath}/spriteFrame`, SpriteFrame, (err, sf) => {
            if (!err && sf) {
                resolve(sf);
                return;
            }
            resources.load(basePath, SpriteFrame, (err2, sf2) => {
                if (!err2 && sf2) {
                    resolve(sf2);
                    return;
                }
                resources.load(basePath, Texture2D, (err3, tex) => {
                    if (err3 || !tex) {
                        resolve(null);
                        return;
                    }
                    const tw = tex.width;
                    const th = tex.height;
                    const sf3 = new SpriteFrame();
                    sf3.texture = tex;
                    sf3.rect = new Rect(0, 0, tw, th);
                    sf3.originalSize = new Size(tw, th);
                    sf3.offset = new Vec2(0, 0);
                    resolve(sf3);
                });
            });
        });
    });
}

export type EpicTarotPreviewOptions = {
    /** 卡牌起始位置（相对 hostRoot 本地坐标，一般为史诗方块中心） */
    startLocalPos: Vec3;
    /** 起始视觉边长（方块格尺寸），用于从小放大到塔罗尺寸 */
    startFaceSize?: number;
};

/**
 * 卡组史诗方块长按预览：自方块位置翻牌移至屏幕中央，展示对应塔罗正面；点击后消散。
 * 无音效；外框比例固定 200:375；翻牌只压 X 轴，避免 Y 被拉成 200×400。
 */
export function openEpicTarotPreviewOverlay(
    hostRoot: Node,
    host: Component,
    cubeId: string,
    opts: EpicTarotPreviewOptions,
): () => void {
    const prev = hostRoot.getChildByName('EpicTarotPreviewRoot');
    prev?.destroy();

    const { w, h } = fullSize(hostRoot);
    const cardW = Math.round(w * CARD_WIDTH_RATIO);
    const cardH = Math.round(cardW * CARD_ASPECT_H_OVER_W);
    const startFace = Math.max(40, opts.startFaceSize ?? 100);
    const startScale = Math.min(startFace / cardW, startFace / cardH);

    const root = new Node('EpicTarotPreviewRoot');
    root.setParent(hostRoot);
    root.setSiblingIndex(hostRoot.children.length - 1);
    root.addComponent(UITransform).setContentSize(w, h);
    const rootWg = root.addComponent(Widget);
    rootWg.isAlignTop = rootWg.isAlignBottom = rootWg.isAlignLeft = rootWg.isAlignRight = true;
    rootWg.top = rootWg.bottom = rootWg.left = rootWg.right = 0;
    rootWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    rootWg.updateAlignment();
    root.addComponent(UIOpacity).opacity = 255;

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
    const dimOp = dim.addComponent(UIOpacity);
    dimOp.opacity = 0;

    const hint = new Node('Hint');
    hint.setParent(root);
    hint.setPosition(0, cardH * 0.5 + 56, 0);
    hint.addComponent(UITransform).setContentSize(w * 0.9, 48);
    const hintLab = hint.addComponent(Label);
    hintLab.string = '点击关闭';
    hintLab.useSystemFont = true;
    hintLab.fontFamily = 'YouYuan, Yuanti SC, STYuanti-SC-Regular, PingFang SC, sans-serif';
    hintLab.isBold = true;
    hintLab.fontSize = 28;
    hintLab.color = C_HINT;
    hintLab.enableOutline = true;
    hintLab.outlineColor = C_HINT_OUTLINE;
    hintLab.outlineWidth = 2;
    hintLab.horizontalAlign = Label.HorizontalAlign.CENTER;
    hintLab.verticalAlign = Label.VerticalAlign.CENTER;
    const hintOp = hint.addComponent(UIOpacity);
    hintOp.opacity = 0;

    const cardRoot = new Node('TarotCard');
    cardRoot.setParent(root);
    cardRoot.setPosition(opts.startLocalPos.x, opts.startLocalPos.y, 0);
    cardRoot.setScale(startScale, startScale, 1);
    const cardUt = cardRoot.addComponent(UITransform);
    cardUt.setContentSize(cardW, cardH);
    cardRoot.addComponent(UIOpacity).opacity = 255;

    const face = new Node('Face');
    face.setParent(cardRoot);
    face.setPosition(0, 0, 0);
    const faceUt = face.addComponent(UITransform);
    faceUt.setContentSize(cardW, cardH);

    const sp = face.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
    sp.color = Color.WHITE;
    sp.enabled = false;

    const g = face.addComponent(Graphics);
    g.fillColor = C_CARD_FALLBACK;
    const rr = Math.min(18, cardW * 0.08);
    g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, rr);
    g.fill();

    let closed = false;
    let phase: 'loading' | 'flipping' | 'revealed' | 'dismissing' = 'loading';

    const closeAll = () => {
        if (closed) return;
        closed = true;
        if (face.isValid) Tween.stopAllByTarget(face);
        if (cardRoot.isValid) Tween.stopAllByTarget(cardRoot);
        if (root.isValid) {
            Tween.stopAllByTarget(root);
            const op = root.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            root.destroy();
        }
    };

    const lockFrame = () => {
        cardUt.setContentSize(cardW, cardH);
        faceUt.setContentSize(cardW, cardH);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
    };

    const applySprite = (sf: SpriteFrame | null) => {
        if (!face.isValid || !sf) return;
        sp.spriteFrame = sf;
        lockFrame();
        sp.enabled = true;
        if (g) g.enabled = false;
    };

    const forceFinalPose = () => {
        if (!cardRoot.isValid || !face.isValid) return;
        Tween.stopAllByTarget(face);
        Tween.stopAllByTarget(cardRoot);
        cardRoot.setScale(1, 1, 1);
        face.setScale(1, 1, 1);
        lockFrame();
    };

    const dismiss = () => {
        if (closed || phase !== 'revealed') return;
        phase = 'dismissing';
        tween(hintOp).to(0.2, { opacity: 0 }, { easing: easing.sineOut }).start();
        const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        tween(op)
            .to(DISMISS_FADE, { opacity: 0 }, { easing: easing.sineIn })
            .call(() => closeAll())
            .start();
    };

    const enterRevealed = () => {
        if (closed || phase !== 'flipping') return;
        phase = 'revealed';
        forceFinalPose();
        tween(hintOp).to(0.28, { opacity: 255 }, { easing: easing.sineOut }).start();
        dim.off(Node.EventType.TOUCH_END);
        dim.on(Node.EventType.TOUCH_END, dismiss, host);
        cardRoot.off(Node.EventType.TOUCH_END);
        cardRoot.on(Node.EventType.TOUCH_END, dismiss, host);
    };

    const startFlip = (back: SpriteFrame | null, faceSf: SpriteFrame | null) => {
        if (closed || !root.isValid) return;
        phase = 'flipping';
        applySprite(back);
        tween(dimOp).to(MOVE_CENTER_DUR * 0.6, { opacity: 255 }, { easing: easing.sineOut }).start();

        Tween.stopAllByTarget(face);
        Tween.stopAllByTarget(cardRoot);
        face.setScale(1, 1, 1);
        cardRoot.setScale(startScale, startScale, 1);

        tween(cardRoot)
            .to(
                MOVE_CENTER_DUR,
                { position: new Vec3(0, 0, 0), scale: new Vec3(1, 1, 1) },
                { easing: easing.sineInOut },
            )
            .start();

        // 只压 X 轴做翻面；不要动 Y（原先 1.04 会把 375 拉成约 400）
        tween(face)
            .to(FLIP_HALF, { scale: new Vec3(0.02, 1, 1) }, { easing: easing.sineIn })
            .call(() => applySprite(faceSf))
            .to(FLIP_HALF, { scale: new Vec3(1, 1, 1) }, { easing: easing.sineOut })
            .call(() => enterRevealed())
            .start();
    };

    loadTarotCardByCubeId(cubeId, (def) => {
        if (closed || !root.isValid) return;
        if (!def) {
            closeAll();
            return;
        }
        void Promise.all([
            loadResourcesSpriteFrame(TALO_BACK),
            loadResourcesSpriteFrame(def.taloFacePath),
        ]).then(([back, faceSf]) => {
            if (closed || !root.isValid) return;
            startFlip(back, faceSf);
        });
    });

    return closeAll;
}
