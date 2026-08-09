import {
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Mask,
    Node,
    ScrollView,
    Sprite,
    SpriteFrame,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
    easing,
} from 'cc';
import { DIALOG_ROW_POP_DURATION, RowRevealRunner } from '../util/DialogRowReveal';
import { getLayoutSizeForNode } from '../util/ViewSize';
import {
    BLOCK_PRICE,
    isShopBlockOwned,
    loadCoins,
    loadPropCounts,
    PROP_PRICE,
    purchaseProp,
    purchaseShopBlock,
    type PropKind,
} from '../util/PlayerResourceStorage';
import { trackBuyBlock, trackBuyProp } from '../util/AnalyticsTracker';
import { SHOP_COLS_PER_ROW, type ShopCatalogGroup } from '../util/ShopCatalog';
import { type DialogActionButtonSprites, mkDialogActionButton } from '../util/DialogActionButtons';
import {
    applyDialogPanelBackground,
    applyLabelBlackOutline,
    getDialogPanelWidthFromParent,
    mkDialogPanelShell,
    refreshDialogPanelBackgroundSize,
} from '../util/DialogPanelBg';
import { showFrameToast, TOAST_COIN_TEXT_COLOR } from '../util/FrameToast';

/** 商店背景贴图在底板高度上额外拉伸的像素（不改底板与关闭按钮位置） */
const SHOP_BG_TEXTURE_STRETCH_H = 190;
/** 底栏：关闭按钮高度 + 上下留白（滚动区不得侵入此区域） */
const SHOP_CLOSE_BTN_H = 48;
const SHOP_CLOSE_BAR_H = SHOP_CLOSE_BTN_H + 20;
/** 收紧滚动区上方留白（标题区预留减少） */
const SHOP_SCROLL_TOP_TRIM = 100;
/** 收紧滚动区下方留白（底栏预留减少，关闭按钮随之上移贴近内容） */
const SHOP_SCROLL_BOTTOM_TRIM = 100;
/** 「商店」标题相对默认位置上移 */
const SHOP_TITLE_OFFSET_UP = 50;
/** 关闭按钮相对底栏中心再下移 */
const SHOP_CLOSE_OFFSET_DOWN = 40;

const C_DIM = new Color(0, 0, 0, 160);
const C_ACCENT = new Color(0xe9, 0xc4, 0x6a, 255);
const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);
const C_BTN_OWNED = new Color(0x41, 0x5a, 0x77, 200);

const BLOCK_COL_W = 116;
const BLOCK_FACE_H = 80;
const BLOCK_PRICE_H = 24;
const BLOCK_BTN_W = 108;
const BLOCK_BTN_H = 40;
const BLOCK_BTN_FONT = 19;
const BLOCK_OWNED_FONT = 15;
const BLOCK_PRICE_FONT = 15;
/** 商店按钮文字描边 */
const SHOP_BTN_OUTLINE_W = 2;
/** 贴图底边到「10 金币」的间距（较原先拉近 5px） */
const FACE_TO_PRICE_GAP = 3;
const BLOCK_ROW_STEP = BLOCK_FACE_H + FACE_TO_PRICE_GAP + BLOCK_PRICE_H + BLOCK_BTN_H + 12;
const COL_GAP = 12;
const PANEL_PAD_X = 20;
const TITLE_AREA = 40;
const COIN_BAR_H = 44;
const PROP_ROW_H = 200;
const PROP_ICON_MAX = 128;
/** 滚动内容与底部「关闭」按钮的额外间距（+10px） */
const SCROLL_BOTTOM_PAD = 10;
const FOOTER_AREA = Math.max(
    56 + SCROLL_BOTTOM_PAD,
    Math.max(SHOP_CLOSE_BTN_H + 24, SHOP_CLOSE_BAR_H - SHOP_SCROLL_BOTTOM_TRIM),
);
const GROUP_TITLE_H = 36;
const GROUP_SECTION_GAP = 28;
/** 道具行与「陆地动物方块」等第一组标题的额外间距 */
const PROP_TO_FIRST_GROUP_GAP = 0;
/** 方块售卖区整体相对道具行再下移（避免与道具购买按钮重叠） */
const SHOP_BLOCKS_TOP_OFFSET = 50;
/** 表头「商店」标题估算宽度，用于金币栏贴其左侧 */
const SHOP_TITLE_EST_W = 56;
const COIN_TO_TITLE_GAP = 10;
const PROP_STOCK_TO_BTN_GAP = 34;

function addCenterFillRect(node: Node, w: number, h: number, fill: Color) {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
}

export type ShopPropIcons = {
    hint: SpriteFrame | null;
    refresh: SpriteFrame | null;
    eliminate: SpriteFrame | null;
};

/** 商店内「购买」按钮与「已拥有」标签贴图（由 GameApp 注入；未配置则用纯色底 + 文字） */
export type ShopButtonSprites = {
    buyNormal: SpriteFrame | null;
    buyPressed: SpriteFrame | null;
    owned: SpriteFrame | null;
};

export class ShopDialog extends Component {
    static open(
        parent: Node,
        opts: {
            groups: ShopCatalogGroup[];
            panelBg: SpriteFrame | null;
            actionButtons?: DialogActionButtonSprites | null;
            coinIcon: SpriteFrame | null;
            propIcons: ShopPropIcons;
            shopButtons?: ShopButtonSprites | null;
            onCoinsChanged?: (coins: number) => void;
            onClose?: () => void;
        },
    ): void {
        const root = new Node('ShopModal');
        root.setParent(parent);
        root.setSiblingIndex(parent.children.length - 1);
        const vs = getLayoutSizeForNode(parent);
        const rw = root.addComponent(UITransform);
        rw.setContentSize(vs.width, vs.height);
        const wg = root.addComponent(Widget);
        wg.isAlignTop = wg.isAlignBottom = wg.isAlignLeft = wg.isAlignRight = true;
        wg.top = wg.bottom = wg.left = wg.right = 0;
        wg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        wg.updateAlignment();

        const comp = root.addComponent(ShopDialog);
        comp.init(opts, vs.width, vs.height);
    }

    private _opts!: {
        groups: ShopCatalogGroup[];
        panelBg: SpriteFrame | null;
        actionButtons: DialogActionButtonSprites | null;
        coinIcon: SpriteFrame | null;
        propIcons: ShopPropIcons;
        shopButtons: ShopButtonSprites | null;
        onCoinsChanged?: (coins: number) => void;
        onClose?: () => void;
    };

    private _coinLabel: Label | null = null;
    private readonly _rowReveal = new RowRevealRunner(this);

    onDestroy() {
        this._rowReveal.stop();
    }

    update(dt: number) {
        this._rowReveal.tick(dt);
    }

    init(
        opts: {
            groups: ShopCatalogGroup[];
            panelBg: SpriteFrame | null;
            actionButtons?: DialogActionButtonSprites | null;
            coinIcon: SpriteFrame | null;
            propIcons: ShopPropIcons;
            shopButtons?: ShopButtonSprites | null;
            onCoinsChanged?: (coins: number) => void;
            onClose?: () => void;
        },
        pw: number,
        ph: number,
    ) {
        this._opts = {
            ...opts,
            actionButtons: opts.actionButtons ?? null,
            shopButtons: opts.shopButtons ?? null,
        };
        this._build(pw, ph);
    }

    private _close() {
        this._opts.onClose?.();
        if (this.node?.isValid) this.node.destroy();
    }

    private _notifyCoins() {
        const c = loadCoins();
        if (this._coinLabel) this._coinLabel.string = `${c}`;
        this._opts.onCoinsChanged?.(c);
    }

    private _showToast(message: string) {
        const panel = this.node.getChildByName('Panel');
        if (!panel) return;
        const panelW = panel.getComponent(UITransform)?.width ?? 400;
        showFrameToast(panel, this, message, {
            duration: 2,
            nodeName: 'ShopToast',
            placement: 'center',
            maxTextWidth: Math.min(panelW - 48, 420),
            compactHeight: message === '购买成功',
            textColor: message === '购买成功' ? TOAST_COIN_TEXT_COLOR : undefined,
        });
    }

    private _bindClick(node: Node, w: number, h: number, onClick: () => void) {
        const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        ut.setContentSize(w, h);
        node.on(
            Node.EventType.TOUCH_END,
            (e: { propagationStopped?: boolean }) => {
                e.propagationStopped = true;
                onClick();
            },
            this,
        );
    }

    /**
     * 在 maxW×maxH 框内按比例显示贴图（不强行铺满，与改前 Graphics 按钮视觉一致）。
     * 返回承载 Sprite 的子节点，供按下态换图。
     */
    private _addShopSpriteVisual(parent: Node, maxW: number, maxH: number, sf: SpriteFrame): Node {
        let vis = parent.getChildByName('Vis');
        if (!vis) {
            vis = new Node('Vis');
            vis.setParent(parent);
        }
        vis.setPosition(0, 0, 0);
        vis.setScale(1, 1, 1);
        const r = sf.rect;
        const uw = Math.max(1, r.width);
        const uh = Math.max(1, r.height);
        const s = Math.min(maxW / uw, maxH / uh);
        const ut = vis.getComponent(UITransform) ?? vis.addComponent(UITransform);
        ut.setContentSize(uw, uh);
        vis.setScale(s, s, 1);
        const sp = vis.getComponent(Sprite) ?? vis.addComponent(Sprite);
        sp.spriteFrame = sf;
        sp.sizeMode = Sprite.SizeMode.TRIMMED;
        sp.color = Color.WHITE;
        return vis;
    }

    private _mountBuySpriteButton(node: Node, w: number, h: number, sfNormal: SpriteFrame, sfPressed: SpriteFrame | null) {
        const vis = this._addShopSpriteVisual(node, w, h, sfNormal);
        const sp = vis.getComponent(Sprite)!;
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

    private _styleShopBtnLabel(lab: Label, text: string, fontSize: number) {
        lab.string = text;
        lab.fontSize = fontSize;
        lab.color = Color.WHITE;
        lab.isBold = false;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(lab, SHOP_BTN_OUTLINE_W);
    }

    private _addShopBtnLabel(parent: Node, w: number, h: number, text: string, fontSize: number): Label {
        const blN = new Node('Label');
        blN.setParent(parent);
        blN.addComponent(UITransform).setContentSize(w, h);
        const bl = blN.addComponent(Label);
        this._styleShopBtnLabel(bl, text, fontSize);
        return bl;
    }

    /** 购买按钮：有贴图则用图（含按下态），否则绿底 +「购买」 */
    private _mkBuyButton(parent: Node, y: number, w: number, h: number, onClick: () => void): Node {
        const btnN = new Node('Buy');
        btnN.setParent(parent);
        btnN.setPosition(0, y, 0);
        btnN.addComponent(UITransform).setContentSize(w, h);

        const fontSize = w >= 90 ? BLOCK_BTN_FONT : BLOCK_OWNED_FONT;
        const sprites = this._opts.shopButtons;
        const buySf = sprites?.buyNormal ?? null;
        if (buySf) {
            this._mountBuySpriteButton(btnN, w, h, buySf, sprites?.buyPressed ?? null);
            const btn = btnN.addComponent(Button);
            btn.transition = Button.Transition.NONE;
            btnN.on(Button.EventType.CLICK, onClick, this);
        } else {
            const bgN = new Node('Bg');
            bgN.setParent(btnN);
            addCenterFillRect(bgN, w, h, C_BTN);
            this._bindClick(btnN, w, h, onClick);
        }
        this._addShopBtnLabel(btnN, w, h, '购买', fontSize);
        return btnN;
    }

    /** 已拥有标签：有贴图则用图，否则灰底 +「已拥有」 */
    private _mkOwnedBadge(parent: Node, y: number, w = BLOCK_BTN_W, h = BLOCK_BTN_H): Node {
        const btnN = new Node('Owned');
        btnN.setParent(parent);
        btnN.setPosition(0, y, 0);
        btnN.addComponent(UITransform).setContentSize(w, h);

        const ownedSf = this._opts.shopButtons?.owned ?? null;
        if (ownedSf) {
            this._addShopSpriteVisual(btnN, w, h, ownedSf);
        } else {
            const bgN = new Node('Bg');
            bgN.setParent(btnN);
            addCenterFillRect(bgN, w, h, C_BTN_OWNED);
        }
        this._addShopBtnLabel(btnN, w, h, '已拥有', BLOCK_OWNED_FONT);
        return btnN;
    }

    private _build(pw: number, ph: number) {
        const dim = new Node('Dim');
        dim.setParent(this.node);
        dim.addComponent(UITransform).setContentSize(pw, ph);
        const dW = dim.addComponent(Widget);
        dW.isAlignTop = dW.isAlignBottom = dW.isAlignLeft = dW.isAlignRight = true;
        dW.top = dW.bottom = dW.left = dW.right = 0;
        dW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        dW.updateAlignment();
        addCenterFillRect(dim, pw, ph, C_DIM);
        const dimBtn = dim.addComponent(Button);
        dimBtn.transition = Button.Transition.NONE;
        dim.on(Button.EventType.CLICK, () => this._close(), this);

        const panelW = getDialogPanelWidthFromParent(this.node);
        const maxOuterH = Math.min(ph - 32, 960);

        let contentH = PROP_ROW_H + 8 + PROP_TO_FIRST_GROUP_GAP + SHOP_BLOCKS_TOP_OFFSET;
        const groupLayouts: { group: ShopCatalogGroup; gridH: number; cols: number }[] = [];
        const cols = SHOP_COLS_PER_ROW;
        for (const g of this._opts.groups) {
            const rows = Math.max(1, Math.ceil(g.items.length / cols));
            const gridH = rows * BLOCK_ROW_STEP;
            groupLayouts.push({ group: g, gridH, cols });
            contentH += GROUP_TITLE_H + gridH + GROUP_SECTION_GAP;
        }
        contentH += SCROLL_BOTTOM_PAD;

        const titleReserve = Math.max(32, TITLE_AREA - SHOP_SCROLL_TOP_TRIM);
        const footReserve = Math.max(SHOP_CLOSE_BTN_H + 24, SHOP_CLOSE_BAR_H - SHOP_SCROLL_BOTTOM_TRIM);
        const viewH = Math.min(contentH, Math.max(280, maxOuterH - titleReserve - footReserve));
        const panelH = Math.min(maxOuterH, titleReserve + viewH + footReserve);

        const panel = mkDialogPanelShell(this.node, panelW, panelH);
        const contentW = panelW - PANEL_PAD_X * 2;
        const bgOpts = { bgHeightExtra: SHOP_BG_TEXTURE_STRETCH_H };
        applyDialogPanelBackground(panel, panelW, panelH, this._opts.panelBg, bgOpts);
        this.scheduleOnce(() => {
            if (!panel.isValid) return;
            refreshDialogPanelBackgroundSize(panel, panelW, panelH, this._opts.panelBg, bgOpts);
        }, 0);

        const shopHeaderY = panelH / 2 - 22 + SHOP_TITLE_OFFSET_UP;

        const titleN = new Node('Title');
        titleN.setParent(panel);
        titleN.setPosition(0, shopHeaderY, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 24, 36);
        const title = titleN.addComponent(Label);
        title.string = '商店';
        title.fontSize = 26;
        title.color = C_ACCENT;
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(title);

        this._mkHeaderCoinBar(panel, contentW, shopHeaderY);

        const scrollSlotTop = panelH / 2 - titleReserve;
        const scrollSlotBottom = -panelH / 2 + footReserve;
        const scrollSlotH = Math.max(120, scrollSlotTop - scrollSlotBottom);
        const scrollViewH = Math.min(contentH, scrollSlotH);
        const scrollCenterY = scrollSlotTop - scrollViewH / 2;
        const footY = -panelH / 2 + footReserve / 2 - SHOP_CLOSE_OFFSET_DOWN;

        const scrollRoot = new Node('ShopScroll');
        scrollRoot.setParent(panel);
        scrollRoot.setPosition(0, scrollCenterY, 0);
        scrollRoot.addComponent(UITransform).setContentSize(contentW, scrollViewH);

        const viewNode = new Node('view');
        viewNode.setParent(scrollRoot);
        viewNode.addComponent(UITransform).setContentSize(contentW, scrollViewH);
        const mask = viewNode.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        const content = new Node('content');
        content.setParent(viewNode);
        const cUt = content.addComponent(UITransform);
        cUt.setContentSize(contentW, contentH);

        const scroll = scrollRoot.addComponent(ScrollView);
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.content = content;
        scroll.elastic = true;
        scroll.cancelInnerEvents = false;

        scroll.scrollToTop(0);

        mkDialogActionButton(
            panel,
            0,
            footY,
            'close',
            '关闭',
            this._opts.actionButtons,
            () => this._close(),
            this,
        );

        let yCursor = contentH / 2 - 4;
        yCursor = this._mkPropRow(content, contentW, yCursor);
        const rowFns: Array<() => void> = [];
        let firstGroup = true;
        for (const lay of groupLayouts) {
            if (firstGroup) {
                yCursor -= PROP_TO_FIRST_GROUP_GAP + SHOP_BLOCKS_TOP_OFFSET;
                firstGroup = false;
            }
            const shell = this._mkBlockGroupShell(content, contentW, yCursor, lay.group, lay.cols);
            yCursor = shell.nextY;
            this._appendShopRowJobs(rowFns, lay.group, lay.cols, shell.grid, shell.gridW, shell.gridH);
        }
        this._rowReveal.start(rowFns);
    }

    /** 按行登记加载任务（自上而下、从左到右，与游戏发牌顺序一致） */
    private _appendShopRowJobs(
        rowFns: Array<() => void>,
        group: ShopCatalogGroup,
        cols: number,
        grid: Node,
        gridW: number,
        gridH: number,
    ) {
        const originX = -gridW / 2 + BLOCK_COL_W / 2;
        const originY = gridH / 2 - BLOCK_ROW_STEP / 2;
        const rowCount = Math.max(1, Math.ceil(group.items.length / cols));
        for (let row = 0; row < rowCount; row++) {
            const rowIndex = row;
            rowFns.push(() => {
                if (!grid.isValid) return;
                for (let col = 0; col < cols; col++) {
                    const idx = rowIndex * cols + col;
                    if (idx >= group.items.length) break;
                    const item = group.items[idx];
                    const bx = originX + col * (BLOCK_COL_W + COL_GAP);
                    const by = originY - rowIndex * BLOCK_ROW_STEP;
                    this._mkShopBlockCell(grid, item, bx, by, true);
                }
            });
        }
    }

    private _playShopCellPop(cell: Node, bx: number, by: number) {
        const popDy = BLOCK_ROW_STEP * 0.35;
        cell.setPosition(bx, by + popDy, 0);
        cell.setScale(0.55, 0.55, 1);
        const op = cell.getComponent(UIOpacity) ?? cell.addComponent(UIOpacity);
        op.opacity = 48;
        tween(cell).stop();
        tween(op).stop();
        tween(cell)
            .to(
                DIALOG_ROW_POP_DURATION,
                { position: new Vec3(bx, by, 0), scale: new Vec3(1, 1, 1) },
                { easing: easing.backOut },
            )
            .start();
        tween(op)
            .to(DIALOG_ROW_POP_DURATION * 0.85, { opacity: 255 }, { easing: easing.sineOut })
            .start();
    }

    /** 表头金币（在「商店」左侧、同 Y，固定在 panel 上不随滚动） */
    private _mkHeaderCoinBar(panel: Node, _contentW: number, headerY: number) {
        const barW = 160;
        const barH = COIN_BAR_H;
        const bar = new Node('CoinBar');
        bar.setParent(panel);
        const barX = -SHOP_TITLE_EST_W / 2 - COIN_TO_TITLE_GAP - barW / 2;
        bar.setPosition(barX, headerY, 0);
        bar.addComponent(UITransform).setContentSize(barW, barH);

        if (this._opts.coinIcon) {
            const iconN = new Node('CoinIcon');
            iconN.setParent(bar);
            iconN.setPosition(-barW / 2 + 28, 0, 0);
            const r = this._opts.coinIcon.rect;
            const uw = Math.max(1, r.width);
            const uh = Math.max(1, r.height);
            iconN.addComponent(UITransform).setContentSize(uw, uh);
            const isp = iconN.addComponent(Sprite);
            isp.spriteFrame = this._opts.coinIcon;
            isp.sizeMode = Sprite.SizeMode.TRIMMED;
            const s = Math.min(32 / uw, 32 / uh);
            iconN.setScale(s, s, 1);
        }

        const labN = new Node('CoinCount');
        labN.setParent(bar);
        labN.setPosition(-barW / 2 + 67, 0, 0);
        labN.addComponent(UITransform).setContentSize(140, 36);
        const lab = labN.addComponent(Label);
        lab.string = `${loadCoins()}`;
        lab.fontSize = 24;
        lab.color = C_ACCENT;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(lab);
        this._coinLabel = lab;
    }

    private _mkPropRow(parent: Node, innerW: number, topY: number): number {
        const rowH = PROP_ROW_H;
        const row = new Node('PropRow');
        row.setParent(parent);
        row.setPosition(0, topY - rowH / 2, 0);
        row.addComponent(UITransform).setContentSize(innerW, rowH);

        const props: { kind: PropKind; title: string; icon: SpriteFrame | null }[] = [
            { kind: 'hint', title: '提示', icon: this._opts.propIcons.hint },
            { kind: 'refresh', title: '刷新', icon: this._opts.propIcons.refresh },
            { kind: 'eliminate', title: '消除', icon: this._opts.propIcons.eliminate },
        ];
        const counts = loadPropCounts();
        const gap = 16;
        const cellW = (innerW - gap * 2) / 3;
        const xs = [-cellW - gap, 0, cellW + gap];

        props.forEach((p, i) => {
            const cell = new Node(`Prop_${p.kind}`);
            cell.setParent(row);
            cell.setPosition(xs[i], 0, 0);
            cell.addComponent(UITransform).setContentSize(cellW, rowH - 16);

            if (p.icon) {
                const iconN = new Node('Icon');
                iconN.setParent(cell);
                iconN.setPosition(0, 36, 0);
                const r = p.icon.rect;
                const uw = Math.max(1, r.width);
                const uh = Math.max(1, r.height);
                iconN.addComponent(UITransform).setContentSize(uw, uh);
                const isp = iconN.addComponent(Sprite);
                isp.spriteFrame = p.icon;
                isp.sizeMode = Sprite.SizeMode.TRIMMED;
                const s = Math.min(PROP_ICON_MAX / uw, PROP_ICON_MAX / uh);
                iconN.setScale(s, s, 1);
            }

            const nameN = new Node('Name');
            nameN.setParent(cell);
            nameN.setPosition(0, -42, 0);
            nameN.addComponent(UITransform).setContentSize(cellW, 24);
            const nl = nameN.addComponent(Label);
            nl.string = p.title;
            nl.fontSize = 21;
            nl.color = Color.WHITE;
            nl.horizontalAlign = Label.HorizontalAlign.CENTER;
            applyLabelBlackOutline(nl);

            const priceN = new Node('Price');
            priceN.setParent(cell);
            priceN.setPosition(0, -66, 0);
            priceN.addComponent(UITransform).setContentSize(cellW, 22);
            const pl = priceN.addComponent(Label);
            pl.string = `${PROP_PRICE} 金币`;
            pl.fontSize = BLOCK_PRICE_FONT;
            pl.color = C_ACCENT;
            pl.isBold = true;
            pl.horizontalAlign = Label.HorizontalAlign.CENTER;
            applyLabelBlackOutline(pl);

            const stockN = new Node('Stock');
            stockN.setParent(cell);
            stockN.setPosition(0, -88, 0);
            stockN.addComponent(UITransform).setContentSize(cellW, 20);
            const sl = stockN.addComponent(Label);
            sl.string = `拥有 ${counts[p.kind]}`;
            sl.fontSize = 14;
            sl.color = Color.WHITE;
            sl.horizontalAlign = Label.HorizontalAlign.CENTER;
            applyLabelBlackOutline(sl, SHOP_BTN_OUTLINE_W);

            this._mkBuyButton(cell, -88 - PROP_STOCK_TO_BTN_GAP, BLOCK_BTN_W, BLOCK_BTN_H, () => {
                if (purchaseProp(p.kind)) {
                    sl.string = `拥有 ${loadPropCounts()[p.kind]}`;
                    this._notifyCoins();
                    trackBuyProp(p.kind, PROP_PRICE, loadCoins());
                } else {
                    this._showToast(`金币不足，需要 ${PROP_PRICE} 金币`);
                }
            });
        });

        return topY - rowH - 12;
    }

    private _mkBlockGroupShell(
        parent: Node,
        innerW: number,
        topY: number,
        group: ShopCatalogGroup,
        cols: number,
    ): { grid: Node; gridW: number; gridH: number; nextY: number } {
        const titleN = new Node(`Title_${group.title}`);
        titleN.setParent(parent);
        titleN.setPosition(0, topY - GROUP_TITLE_H / 2, 0);
        titleN.addComponent(UITransform).setContentSize(innerW, GROUP_TITLE_H);
        const tl = titleN.addComponent(Label);
        tl.string = group.title;
        tl.fontSize = 20;
        tl.color = C_ACCENT;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(tl);

        const rows = Math.max(1, Math.ceil(group.items.length / cols));
        const gridH = rows * BLOCK_ROW_STEP;
        const gridW = cols * BLOCK_COL_W + Math.max(0, cols - 1) * COL_GAP;

        const grid = new Node(`Grid_${group.title}`);
        grid.setParent(parent);
        grid.setPosition(0, topY - GROUP_TITLE_H - gridH / 2 - 4, 0);
        grid.addComponent(UITransform).setContentSize(gridW, gridH);

        return {
            grid,
            gridW,
            gridH,
            nextY: topY - GROUP_TITLE_H - gridH - GROUP_SECTION_GAP,
        };
    }

    private _mkShopBlockCell(
        grid: Node,
        item: ShopCatalogGroup['items'][number],
        bx: number,
        by: number,
        animate = false,
    ) {
        const cellH = BLOCK_ROW_STEP;
        const cell = new Node(`B_${item.shopKey}`);
        cell.setParent(grid);
        cell.addComponent(UITransform).setContentSize(BLOCK_COL_W, cellH);
        if (animate) {
            this._playShopCellPop(cell, bx, by);
        } else {
            cell.setPosition(bx, by, 0);
        }

        const halfH = cellH / 2;
        const faceY = halfH - BLOCK_FACE_H / 2 - 6;
        const faceN = new Node('Face');
        faceN.setParent(cell);
        faceN.setPosition(0, faceY, 0);
        const r = item.sprite.rect;
        const uw = Math.max(1, r.width);
        const uh = Math.max(1, r.height);
        faceN.addComponent(UITransform).setContentSize(uw, uh);
        const fsp = faceN.addComponent(Sprite);
        fsp.spriteFrame = item.sprite;
        fsp.sizeMode = Sprite.SizeMode.TRIMMED;
        const s = Math.min((BLOCK_FACE_H - 4) / uw, (BLOCK_FACE_H - 4) / uh);
        faceN.setScale(s, s, 1);

        const priceY = faceY - BLOCK_FACE_H / 2 - BLOCK_PRICE_H / 2 - FACE_TO_PRICE_GAP;
        const priceN = new Node('Price');
        priceN.setParent(cell);
        priceN.setPosition(0, priceY, 0);
        priceN.addComponent(UITransform).setContentSize(BLOCK_COL_W, BLOCK_PRICE_H);
        const pl = priceN.addComponent(Label);
        pl.string = `${item.price} 金币`;
        pl.fontSize = BLOCK_PRICE_FONT;
        pl.color = C_ACCENT;
        pl.isBold = true;
        pl.horizontalAlign = Label.HorizontalAlign.CENTER;
        pl.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(pl);

        const btnY = priceY - BLOCK_PRICE_H / 2 - BLOCK_BTN_H / 2 - 4;
        const owned = isShopBlockOwned(item.shopKey);

        if (owned) {
            this._mkOwnedBadge(cell, btnY);
        } else {
            const btnN = this._mkBuyButton(cell, btnY, BLOCK_BTN_W, BLOCK_BTN_H, () => {
                const result = purchaseShopBlock(item.shopKey);
                if (result === 'success') {
                    btnN.destroy();
                    this._mkOwnedBadge(cell, btnY);
                    this._notifyCoins();
                    this._showToast('购买成功');
                    trackBuyBlock(item.shopKey, item.price ?? BLOCK_PRICE, loadCoins());
                } else if (result === 'insufficient_coins') {
                    this._showToast(`金币不足，需要 ${item.price} 金币`);
                } else if (result === 'already_owned') {
                    btnN.destroy();
                    this._mkOwnedBadge(cell, btnY);
                }
            });
        }
    }
}
