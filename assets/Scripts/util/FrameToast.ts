import {
    Color,
    Component,
    Label,
    Node,
    Rect,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    Widget,
} from 'cc';
import { getLayoutSizeForNode } from './ViewSize';

const TOAST_FRAME_RES = '提示框4';
const TOAST_EXTRA_W = 100;
/** 默认字号（较先前 +1 号）；行高略大于字号，避免描边后字距过紧 */
const TOAST_FONT_SIZE = 24;
const TOAST_LINE_HEIGHT_EXTRA = 8;
const TOAST_MIDDLE_PAD_H = 8;
const TOAST_SLICE_CAP_X_RATIO = 0.11;
const TOAST_SLICE_CAP_Y_RATIO = 0.06;
/** 文案在提示框内竖直居中；勿再上移，否则会看起来偏上 */
const TOAST_TEXT_OFFSET_Y = 0;
const TOAST_OUTLINE_WIDTH = 2;
/** 默认提示：白边黑字 */
const TOAST_DEFAULT_TEXT_COLOR = Color.BLACK;
/** 与首页/商店金币数字一致的金色 */
export const TOAST_COIN_TEXT_COLOR = new Color(0xe9, 0xc4, 0x6a, 255);

function toastLineHeight(fontSize: number) {
    return fontSize + TOAST_LINE_HEIGHT_EXTRA;
}

function applyToastLabelOutline(lab: Label) {
    lab.enableOutline = true;
    lab.outlineColor = Color.WHITE;
    lab.outlineWidth = TOAST_OUTLINE_WIDTH;
}

let _toastBg: SpriteFrame | null = null;

export type FrameToastPlacement = 'center' | 'top';

export type FrameToastOptions = {
    duration?: number;
    nodeName?: string;
    /** center：父节点正中；top：靠上水平居中（游戏内提示） */
    placement?: FrameToastPlacement;
    topOffset?: number;
    maxTextWidth?: number;
    /** 单行短文案：高度仅上下边框；多行/auto 时含中间拉伸区 */
    compactHeight?: boolean;
    textOffsetY?: number;
    /** 文案颜色，默认深棕 */
    textColor?: Color;
};

function configureToastFrameSlice(sf: SpriteFrame) {
    const w = Math.max(1, sf.rect.width);
    const h = Math.max(1, sf.rect.height);
    const capL = Math.round(w * TOAST_SLICE_CAP_X_RATIO);
    const capR = Math.round(w * TOAST_SLICE_CAP_X_RATIO);
    const capT = Math.round(h * TOAST_SLICE_CAP_Y_RATIO);
    const capB = Math.round(h * TOAST_SLICE_CAP_Y_RATIO);
    const midW = Math.max(1, w - capL - capR);
    const midH = Math.max(1, h - capT - capB);
    const ext = sf as SpriteFrame & {
        capInsets?: Rect;
        insetTop?: number;
        insetBottom?: number;
        insetLeft?: number;
        insetRight?: number;
    };
    ext.capInsets = new Rect(capL, capB, midW, midH);
    ext.insetTop = capT;
    ext.insetBottom = capB;
    ext.insetLeft = capL;
    ext.insetRight = capR;
}

function toastFrameCaps(sf: SpriteFrame) {
    const w = Math.max(1, sf.rect.width);
    const h = Math.max(1, sf.rect.height);
    return {
        capL: Math.round(w * TOAST_SLICE_CAP_X_RATIO),
        capR: Math.round(w * TOAST_SLICE_CAP_X_RATIO),
        capT: Math.round(h * TOAST_SLICE_CAP_Y_RATIO),
        capB: Math.round(h * TOAST_SLICE_CAP_Y_RATIO),
    };
}

function measureToastText(
    parent: Node,
    message: string,
    fontSize: number,
    maxWidth: number,
    wrap: boolean,
): { w: number; h: number } {
    const n = new Node('_ToastMeasure');
    n.setParent(parent);
    n.active = false;
    const ut = n.addComponent(UITransform);
    const lab = n.addComponent(Label);
    lab.string = message;
    lab.fontSize = fontSize;
    lab.lineHeight = toastLineHeight(fontSize);
    lab.enableWrapText = wrap;
    lab.overflow = wrap ? Label.Overflow.RESIZE_HEIGHT : Label.Overflow.NONE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    if (wrap) {
        ut.setContentSize(maxWidth, 0);
    }
    lab.updateRenderData(true);
    const s = ut.contentSize;
    n.destroy();
    return {
        w: Math.max(1, wrap ? Math.min(maxWidth, s.width) : s.width),
        h: Math.max(1, s.height),
    };
}

function toastBoxSize(sf: SpriteFrame, textW: number, textH: number, compactHeight: boolean) {
    const { capL, capR, capT, capB } = toastFrameCaps(sf);
    const boxW = Math.max(Math.ceil(textW) + TOAST_EXTRA_W, capL + capR + 24);
    const boxH = compactHeight ? capT + capB : capT + capB + Math.ceil(textH) + TOAST_MIDDLE_PAD_H;
    return { boxW, boxH };
}

function mountToastBg(parent: Node, host: Component, sf: SpriteFrame, boxW: number, boxH: number) {
    configureToastFrameSlice(sf);
    const bg = new Node('Bg');
    bg.setParent(parent);
    bg.setPosition(0, 0, 0);
    const ut = bg.addComponent(UITransform);
    ut.setAnchorPoint(0.5, 0.5);
    ut.setContentSize(boxW, boxH);
    const sp = bg.addComponent(Sprite);
    sp.type = Sprite.Type.SLICED;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    sp.color = Color.WHITE;
    ut.setContentSize(boxW, boxH);
    host.scheduleOnce(() => {
        if (!bg.isValid || !sp.isValid) return;
        ut.setContentSize(boxW, boxH);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SLICED;
    }, 0);
}

function loadToastBg(done: (sf: SpriteFrame | null) => void) {
    if (_toastBg) {
        done(_toastBg);
        return;
    }
    resources.load(`${TOAST_FRAME_RES}/spriteFrame`, SpriteFrame, (err, sf) => {
        if (!err && sf) {
            _toastBg = sf;
            configureToastFrameSlice(_toastBg);
            done(sf);
            return;
        }
        resources.load(TOAST_FRAME_RES, SpriteFrame, (err2, sf2) => {
            if (!err2 && sf2) {
                _toastBg = sf2;
                configureToastFrameSlice(_toastBg);
            }
            done(_toastBg);
        });
    });
}

function mountToastLabel(
    parent: Node,
    host: Component,
    message: string,
    boxW: number,
    boxH: number,
    textOffsetY: number,
    textColor: Color,
) {
    const labN = new Node('Msg');
    labN.setParent(parent);
    labN.setSiblingIndex(parent.children.length - 1);
    const labUt = labN.addComponent(UITransform);
    labUt.setAnchorPoint(0.5, 0.5);
    labUt.setContentSize(boxW, boxH);
    const labWg = labN.addComponent(Widget);
    labWg.isAlignHorizontalCenter = true;
    labWg.isAlignVerticalCenter = true;
    labWg.horizontalCenter = 0;
    labWg.verticalCenter = textOffsetY;
    labWg.alignMode = Widget.AlignMode.ALWAYS;
    labWg.updateAlignment();

    const lab = labN.addComponent(Label);
    lab.string = message;
    lab.fontSize = TOAST_FONT_SIZE;
    lab.lineHeight = toastLineHeight(TOAST_FONT_SIZE);
    lab.color = textColor;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.CLAMP;
    lab.enableWrapText = message.includes('\n') || message.length > 14;
    applyToastLabelOutline(lab);
    lab.updateRenderData(true);
    host.scheduleOnce(() => {
        if (!labN.isValid) return;
        labWg.verticalCenter = textOffsetY;
        labWg.updateAlignment();
        labN.setPosition(0, textOffsetY, 0);
        lab.updateRenderData(true);
    }, 0);
}

function applyToastPlacement(root: Node, placement: FrameToastPlacement, topOffset: number) {
    const wg = root.addComponent(Widget);
    wg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    if (placement === 'top') {
        wg.isAlignTop = true;
        wg.isAlignHorizontalCenter = true;
        wg.top = topOffset;
    } else {
        wg.isAlignHorizontalCenter = true;
        wg.isAlignVerticalCenter = true;
    }
    wg.updateAlignment();
}

/**
 * 使用 resources/提示框4 九宫格背景的通用提示框。
 * @returns 提示根节点（duration 结束后自动销毁）
 */
export function showFrameToast(
    parent: Node,
    host: Component,
    message: string,
    opts?: FrameToastOptions,
): Node | null {
    if (!parent?.isValid || !host?.isValid) return null;

    const nodeName = opts?.nodeName ?? 'FrameToast';
    const duration = opts?.duration ?? 2;
    const placement = opts?.placement ?? 'center';
    const topOffset = opts?.topOffset ?? 100;
    const textOffsetY = opts?.textOffsetY ?? TOAST_TEXT_OFFSET_Y;
    const maxTextWidth = opts?.maxTextWidth ?? Math.min(520, getLayoutSizeForNode(parent).width - 48);
    const compactHeight = opts?.compactHeight ?? (!message.includes('\n') && message.length <= 12);
    const textColor = opts?.textColor ?? TOAST_DEFAULT_TEXT_COLOR;

    const prev = parent.getChildByName(nodeName);
    if (prev?.isValid) prev.destroy();

    const root = new Node(nodeName);
    root.setParent(parent);
    root.setSiblingIndex(parent.children.length - 1);
    root.setPosition(0, 0, 0);
    applyToastPlacement(root, placement, topOffset);

    loadToastBg((sf) => {
        if (!parent.isValid || !host.isValid) return;
        if (!root.isValid) return;

        const wrap = !compactHeight || message.includes('\n') || message.length > 12;
        const textSize = measureToastText(parent, message, TOAST_FONT_SIZE, maxTextWidth, wrap);
        const { boxW, boxH } = sf
            ? toastBoxSize(sf, textSize.w, textSize.h, compactHeight)
            : {
                  boxW: Math.ceil(textSize.w) + TOAST_EXTRA_W,
                  boxH: Math.max(72, Math.ceil(textSize.h) + TOAST_MIDDLE_PAD_H),
              };

        const tUt = root.getComponent(UITransform) ?? root.addComponent(UITransform);
        tUt.setContentSize(boxW, boxH);

        if (sf) {
            mountToastBg(root, host, sf, boxW, boxH);
        }

        mountToastLabel(root, host, message, boxW, boxH, textOffsetY, textColor);

        host.scheduleOnce(() => {
            if (root.isValid) root.destroy();
        }, duration);
    });

    return root;
}
