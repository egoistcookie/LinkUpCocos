import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { getStableVisibleSize } from './ViewSize';

const C_PANEL_FALLBACK = new Color(0x1b, 0x26, 0x3b, 245);

/** 弹窗相对画面总宽度的水平内缩 */
export const DIALOG_PANEL_WIDTH_INSET = 50;

export function applyLabelBlackOutline(lab: Label, width = 2) {
    lab.enableOutline = true;
    lab.outlineColor = Color.BLACK;
    lab.outlineWidth = width;
}

/** 从弹窗根节点（全屏 Modal）读取可用宽度并内缩 */
export function getDialogPanelWidthFromParent(modalRoot: Node): number {
    const ut = modalRoot.getComponent(UITransform);
    const lw = ut && ut.width > 1 ? ut.width : getStableVisibleSize().width;
    return Math.max(280, lw - DIALOG_PANEL_WIDTH_INSET);
}

/** 固定 UITransform 宽高，居中于全屏 Modal（不加 Widget，避免被拉满屏宽） */
export function mkDialogPanelShell(parent: Node, panelW: number, panelH: number): Node {
    const panel = new Node('Panel');
    panel.setParent(parent);
    panel.setPosition(0, 0, 0);
    const pUt = panel.addComponent(UITransform);
    pUt.setContentSize(panelW, panelH);
    return panel;
}

export type DialogPanelBgOptions = {
    /** 背景贴图在底板高度上额外拉伸的像素（仅 PanelBg，不改底板 UITransform） */
    bgHeightExtra?: number;
};

function hasSliceCapInsets(sf: SpriteFrame): boolean {
    const cap = sf.capInsets;
    return !!(cap && (cap.width > 0 || cap.height > 0 || cap.x > 0 || cap.y > 0));
}

function mountPanelBgSprite(bg: Node, spriteFrame: SpriteFrame, w: number, h: number) {
    const ut = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
    ut.setAnchorPoint(0.5, 0.5);
    ut.setContentSize(w, h);

    const sp = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = hasSliceCapInsets(spriteFrame) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    sp.spriteFrame = spriteFrame;
    sp.color = Color.WHITE;
    ut.setContentSize(w, h);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
}

/**
 * 背景贴图子节点 PanelBg：宽 = panelW，高 = panelH + bgHeightExtra，CUSTOM/SLICED 拉伸
 */
export function applyDialogPanelBackground(
    panel: Node,
    panelW: number,
    panelH: number,
    spriteFrame: SpriteFrame | null,
    opts?: DialogPanelBgOptions,
) {
    const extraH = opts?.bgHeightExtra ?? 0;
    const bgW = panelW;
    const bgH = panelH + extraH;

    const old = panel.getChildByName('PanelBg');
    if (old?.isValid) old.destroy();

    const bg = new Node('PanelBg');
    bg.setParent(panel);
    bg.setSiblingIndex(0);
    bg.setPosition(0, 0, 0);

    if (spriteFrame) {
        mountPanelBgSprite(bg, spriteFrame, bgW, bgH);
    } else {
        const ut = bg.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0.5);
        ut.setContentSize(bgW, bgH);
        const g = bg.addComponent(Graphics);
        g.fillColor = C_PANEL_FALLBACK;
        g.fillRect(-bgW / 2, -bgH / 2, bgW, bgH);
    }
}

/** 下一帧再设一次尺寸，避免 Sprite 赋值后回退为原图大小 */
export function refreshDialogPanelBackgroundSize(
    panel: Node,
    panelW: number,
    panelH: number,
    spriteFrame: SpriteFrame | null,
    opts?: DialogPanelBgOptions,
) {
    const extraH = opts?.bgHeightExtra ?? 0;
    const bgW = panelW;
    const bgH = panelH + extraH;
    const bg = panel.getChildByName('PanelBg');
    if (!bg?.isValid) return;

    const ut = bg.getComponent(UITransform);
    if (ut) ut.setContentSize(bgW, bgH);

    if (spriteFrame) {
        mountPanelBgSprite(bg, spriteFrame, bgW, bgH);
    } else {
        const g = bg.getComponent(Graphics);
        if (g) {
            g.clear();
            g.fillColor = C_PANEL_FALLBACK;
            g.fillRect(-bgW / 2, -bgH / 2, bgW, bgH);
        }
    }
}
