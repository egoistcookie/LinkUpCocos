import {
    AudioClip,
    AudioSource,
    BlockInputEvents,
    Button,
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
    assetManager,
    easing,
    resources,
    tween,
} from 'cc';

const C_DIM = new Color(0, 0, 0, 180);
const C_HINT = new Color(0xe9, 0xc4, 0x6a, 255);
const C_HINT_OUTLINE = new Color(0x3a, 0x2a, 0x18, 255);
const C_CARD_FALLBACK = new Color(0x2b, 0x1d, 0x3a, 255);

/** resources/talo 下贴图基路径（无扩展名） */
const TALO_BACK = 'talo/塔罗牌-背面';
const TALO_FACE = 'talo/塔罗牌-小瓦1';
/** assets/sounds/升星.mp3（resources 副本优先） */
const TALO_FLIP_SFX_RES = 'sound/升星';
const TALO_FLIP_SFX_UUID = 'ee7deb7e-543e-4ed7-98a4-c3353fda72dc';

/** 两张牌合计占屏宽比例 */
const CARDS_TOTAL_WIDTH_RATIO = 0.8;
/** 牌间距占合计宽度比例 */
const CARD_GAP_RATIO = 0.08;
/** 高:宽 = 3.75:2 */
const CARD_ASPECT_H_OVER_W = 3.75 / 2;

/** 翻牌半程（相对初版放缓一倍） */
const FLIP_HALF = 0.36;
/** 移至画面中央的时长 ≈ 完整翻牌 */
const MOVE_CENTER_DUR = FLIP_HALF * 2;
const DISMISS_FADE = 0.55;
const ENTER_STAGGER = 0.08;

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
                    const w = tex.width;
                    const h = tex.height;
                    const sf3 = new SpriteFrame();
                    sf3.texture = tex;
                    sf3.rect = new Rect(0, 0, w, h);
                    sf3.originalSize = new Size(w, h);
                    sf3.offset = new Vec2(0, 0);
                    resolve(sf3);
                });
            });
        });
    });
}

function loadTarotFlipSfx(preferred: AudioClip | null): Promise<AudioClip | null> {
    if (preferred) return Promise.resolve(preferred);
    return new Promise((resolve) => {
        resources.load(TALO_FLIP_SFX_RES, AudioClip, (err, clip) => {
            if (!err && clip) {
                resolve(clip);
                return;
            }
            assetManager.loadAny({ uuid: TALO_FLIP_SFX_UUID }, (err2, asset) => {
                if (!err2 && asset instanceof AudioClip) {
                    resolve(asset);
                    return;
                }
                resolve(null);
            });
        });
    });
}

function mkHintLabel(parent: Node, y: number, screenW: number): Node {
    const n = new Node('Hint');
    n.setParent(parent);
    n.setPosition(0, y, 0);
    n.addComponent(UITransform).setContentSize(screenW * 0.9, 48);
    const lab = n.addComponent(Label);
    lab.string = '选择一张翻开';
    lab.useSystemFont = true;
    lab.fontFamily = 'YouYuan, Yuanti SC, STYuanti-SC-Regular, PingFang SC, sans-serif';
    lab.isBold = true;
    lab.fontSize = 28;
    lab.color = C_HINT;
    lab.enableOutline = true;
    lab.outlineColor = C_HINT_OUTLINE;
    lab.outlineWidth = 2;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    return n;
}

type CardRefs = {
    root: Node;
    face: Node;
    sprite: Sprite;
    button: Button;
};

export type TarotDrawOverlayOptions = {
    /** 翻开音效；不传则尝试加载 sounds/升星 */
    flipSfx?: AudioClip | null;
    /** 若提供则用其播放；否则在 overlay 根节点挂 AudioSource */
    playSfx?: (clip: AudioClip) => void;
};

/**
 * 通关结算前抽卡特效：左右两张塔罗牌，点选翻开并移至中央，再次点击后消散进入结算。
 * 返回关闭函数。
 */
export function openTarotDrawOverlay(
    gameRoot: Node,
    host: Component,
    onFinished: () => void,
    opts: TarotDrawOverlayOptions | null = null,
): () => void {
    const prev = gameRoot.getChildByName('TarotDrawRoot');
    prev?.destroy();

    const { w, h } = fullSize(gameRoot);
    const totalCardsW = w * CARDS_TOTAL_WIDTH_RATIO;
    const gap = totalCardsW * CARD_GAP_RATIO;
    const cardW = (totalCardsW - gap) / 2;
    const cardH = cardW * CARD_ASPECT_H_OVER_W;

    const root = new Node('TarotDrawRoot');
    root.setParent(gameRoot);
    root.setSiblingIndex(gameRoot.children.length - 1);
    root.addComponent(UITransform).setContentSize(w, h);
    const rootWg = root.addComponent(Widget);
    rootWg.isAlignTop = rootWg.isAlignBottom = rootWg.isAlignLeft = rootWg.isAlignRight = true;
    rootWg.top = rootWg.bottom = rootWg.left = rootWg.right = 0;
    rootWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    rootWg.updateAlignment();
    const rootOp = root.addComponent(UIOpacity);
    rootOp.opacity = 255;

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

    const hintY = cardH * 0.5 + 56;
    const hint = mkHintLabel(root, hintY, w);
    const hintLab = hint.getComponent(Label)!;

    let closed = false;
    /** select → flipping → revealed → dismissing */
    let phase: 'select' | 'flipping' | 'revealed' | 'dismissing' = 'select';
    let faceSf: SpriteFrame | null = null;
    let flipSfx: AudioClip | null = null;
    const cards: CardRefs[] = [];

    const closeAll = () => {
        if (closed) return;
        closed = true;
        for (const c of cards) {
            if (c.face.isValid) Tween.stopAllByTarget(c.face);
            if (c.root.isValid) Tween.stopAllByTarget(c.root);
        }
        if (root.isValid) {
            Tween.stopAllByTarget(root);
            const op = root.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            root.destroy();
        }
    };

    const playFlipSfx = () => {
        if (!flipSfx) return;
        if (opts?.playSfx) {
            opts.playSfx(flipSfx);
            return;
        }
        if (!root.isValid) return;
        const src = root.getComponent(AudioSource) ?? root.addComponent(AudioSource);
        src.playOneShot(flipSfx, 1);
    };

    const applyFace = (card: CardRefs, sf: SpriteFrame | null) => {
        if (sf) {
            card.sprite.spriteFrame = sf;
            card.sprite.enabled = true;
            const g = card.face.getComponent(Graphics);
            if (g) g.enabled = false;
        }
    };

    const dismissAndContinue = () => {
        if (closed || phase !== 'revealed') return;
        phase = 'dismissing';
        for (const c of cards) {
            if (c.button.isValid) c.button.interactable = false;
        }
        if (hint.isValid) {
            const hop = hint.getComponent(UIOpacity) ?? hint.addComponent(UIOpacity);
            tween(hop).to(0.2, { opacity: 0 }, { easing: easing.sineOut }).start();
        }
        const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        tween(op)
            .to(DISMISS_FADE, { opacity: 0 }, { easing: easing.sineIn })
            .call(() => {
                if (closed) return;
                closeAll();
                onFinished();
            })
            .start();
    };

    const onRevealedTap = () => {
        dismissAndContinue();
    };

    const enterRevealedPhase = (card: CardRefs) => {
        if (closed || phase !== 'flipping') return;
        phase = 'revealed';
        if (hint.isValid && hintLab) {
            hintLab.string = '点击继续';
            const hop = hint.getComponent(UIOpacity) ?? hint.addComponent(UIOpacity);
            hop.opacity = 0;
            tween(hop).to(0.28, { opacity: 255 }, { easing: easing.sineOut }).start();
        }
        if (card.root.isValid) {
            card.root.setSiblingIndex(root.children.length - 1);
        }
        if (card.button.isValid) card.button.interactable = true;
        dim.off(Node.EventType.TOUCH_END);
        dim.on(Node.EventType.TOUCH_END, onRevealedTap, host);
    };

    const flipCard = (index: number) => {
        if (closed) return;
        if (phase === 'revealed') {
            onRevealedTap();
            return;
        }
        if (phase !== 'select') return;
        const card = cards[index];
        if (!card?.root.isValid) return;
        phase = 'flipping';
        playFlipSfx();

        for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            if (!c?.button.isValid) continue;
            c.button.interactable = false;
            if (i !== index) {
                const op = c.root.getComponent(UIOpacity) ?? c.root.addComponent(UIOpacity);
                tween(op).to(MOVE_CENTER_DUR, { opacity: 0 }, { easing: easing.sineOut }).start();
                tween(c.root)
                    .to(MOVE_CENTER_DUR, { scale: new Vec3(0.86, 0.86, 1) }, { easing: easing.sineOut })
                    .start();
            }
        }
        if (hint.isValid) {
            const hop = hint.getComponent(UIOpacity) ?? hint.addComponent(UIOpacity);
            tween(hop).to(0.25, { opacity: 0 }, { easing: easing.sineOut }).start();
        }

        Tween.stopAllByTarget(card.face);
        Tween.stopAllByTarget(card.root);
        card.face.setScale(1, 1, 1);

        // 翻开同时缓慢移至画面正中央，并略放大
        tween(card.root)
            .to(
                MOVE_CENTER_DUR,
                { position: new Vec3(0, 0, 0), scale: new Vec3(1.08, 1.08, 1) },
                { easing: easing.sineInOut },
            )
            .start();

        tween(card.face)
            .to(FLIP_HALF, { scale: new Vec3(0.02, 1.04, 1) }, { easing: easing.sineIn })
            .call(() => applyFace(card, faceSf))
            .to(FLIP_HALF, { scale: new Vec3(1, 1, 1) }, { easing: easing.sineOut })
            .call(() => enterRevealedPhase(card))
            .start();
    };

    const mkCard = (x: number, index: number): CardRefs => {
        const cardRoot = new Node(`TarotCard${index}`);
        cardRoot.setParent(root);
        cardRoot.setPosition(x, 0, 0);
        cardRoot.setScale(0.86, 0.86, 1);
        cardRoot.addComponent(UITransform).setContentSize(cardW, cardH);
        cardRoot.addComponent(UIOpacity).opacity = 0;

        const face = new Node('Face');
        face.setParent(cardRoot);
        face.setPosition(0, 0, 0);
        face.addComponent(UITransform).setContentSize(cardW, cardH);

        const sp = face.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.color = Color.WHITE;
        sp.enabled = false;

        const g = face.addComponent(Graphics);
        g.fillColor = C_CARD_FALLBACK;
        const r = Math.min(18, cardW * 0.08);
        g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, r);
        g.fill();

        const btn = cardRoot.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        btn.interactable = false;
        cardRoot.on(Button.EventType.CLICK, () => flipCard(index), host);

        return { root: cardRoot, face, sprite: sp, button: btn };
    };

    const leftX = -(gap + cardW) / 2;
    const rightX = (gap + cardW) / 2;
    cards.push(mkCard(leftX, 0), mkCard(rightX, 1));

    void Promise.all([
        loadResourcesSpriteFrame(TALO_BACK),
        loadResourcesSpriteFrame(TALO_FACE),
        loadTarotFlipSfx(opts?.flipSfx ?? null),
    ]).then(([back, face, sfx]) => {
        if (closed || !root.isValid) return;
        faceSf = face;
        flipSfx = sfx;
        for (const c of cards) {
            if (!c.root.isValid) continue;
            if (back) {
                c.sprite.spriteFrame = back;
                c.sprite.enabled = true;
                const g = c.face.getComponent(Graphics);
                if (g) g.enabled = false;
            }
        }
        cards.forEach((c, i) => {
            if (!c.root.isValid) return;
            const op = c.root.getComponent(UIOpacity)!;
            tween(op)
                .delay(i * ENTER_STAGGER)
                .to(0.28, { opacity: 255 }, { easing: easing.sineOut })
                .start();
            tween(c.root)
                .delay(i * ENTER_STAGGER)
                .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: easing.backOut })
                .call(() => {
                    if (c.button.isValid && phase === 'select') c.button.interactable = true;
                })
                .start();
        });
    });

    return closeAll;
}
