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
    type DeckEntry,
    getConfiguredTypeIds,
    getDeckSelectableTypeIds,
    isDeckSelectionValid,
    loadDeckShopKeysRaw,
    loadDeckTypeIdsRaw,
    MAX_DECK_TYPE_COUNT,
    MIN_DECK_TYPE_COUNT,
    saveDeckShopKeys,
    saveDeckTypeIds,
} from '../util/DeckSelectionStorage';
import { deckShopKeysToTypeIds, makeEpicShopKey, type ShopCatalogGroup } from '../util/ShopCatalog';
import {
    type DialogActionButtonResult,
    type DialogActionButtonSprites,
    mkDialogActionButton,
    setDialogOkEnabled,
} from '../util/DialogActionButtons';
import {
    applyDialogPanelBackground,
    applyLabelBlackOutline,
    getDialogPanelWidthFromParent,
    mkDialogPanelShell,
    refreshDialogPanelBackgroundSize,
} from '../util/DialogPanelBg';
import { trackDeckConfig } from '../util/AnalyticsTracker';

type DeckGridItem = { key: string | number; sf: SpriteFrame; selectable?: boolean };
type DeckSection = { title: string; items: DeckGridItem[]; selectable?: boolean };

export type EpicDeckItem = { id: string; sprite: SpriteFrame };

/** 配置卡组背景贴图在底板高度上额外向下拉伸的像素 */
const DECK_BG_TEXTURE_STRETCH_H = 80;

const C_DIM = new Color(0, 0, 0, 160);
const C_ACCENT = new Color(0xe9, 0xc4, 0x6a, 255);
/** 卡组格：未选中描边 */
const C_DECK_CELL_BORDER = new Color(0x41, 0x5a, 0x77, 200);
/** 卡组格：选中金框与底光 */
const C_DECK_SEL_BORDER = new Color(0xff, 0xd9, 0x52, 255);
const C_DECK_SEL_GLOW = new Color(0xff, 0xeb, 0xa8, 100);
const C_DECK_SEL_INNER = new Color(0xff, 0xf5, 0xc8, 200);
const C_DECK_SEL_FACE = new Color(0xff, 0xfc, 0xe8, 255);
const DECK_SEL_BORDER_W = 7;
const DECK_UNSEL_BORDER_W = 2;
const DECK_SEL_FACE_SCALE = 1.1;
const CELL_FACE = 100;
const CELL_GAP = 10;
const DECK_GROUP_TITLE_H = 36;
const DECK_GROUP_SECTION_GAP = 24;
const DECK_CONTENT_TOP_PAD = 8;
const PANEL_PAD_X = 24;
const TITLE_AREA = 88;
const FOOTER_AREA = 132;

function addCenterFillRect(node: Node, w: number, h: number, fill: Color) {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
}

export class DeckSelectDialog extends Component {
    static open(
        parent: Node,
        opts: {
            tileFaces: Array<SpriteFrame | null>;
            panelBg: SpriteFrame | null;
            actionButtons?: DialogActionButtonSprites | null;
            shopEnabled?: boolean;
            shopGroups?: ShopCatalogGroup[];
            deckEntries?: DeckEntry[];
            /** 通关获得的史诗方块，展示在卡组最上方 */
            epicItems?: EpicDeckItem[];
            onSaved?: (ids: number[]) => void;
            onClose?: () => void;
        },
    ): void {
        const root = new Node('DeckSelectModal');
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

        const comp = root.addComponent(DeckSelectDialog);
        comp.init(opts, vs.width, vs.height);
    }

    private _opts!: {
        tileFaces: Array<SpriteFrame | null>;
        panelBg: SpriteFrame | null;
        actionButtons: DialogActionButtonSprites | null;
        shopEnabled: boolean;
        shopGroups?: ShopCatalogGroup[];
        deckEntries?: DeckEntry[];
        epicItems?: EpicDeckItem[];
        onSaved?: (ids: number[]) => void;
        onClose?: () => void;
    };

    private _selectedIds = new Set<number>();
    private _selectedShopKeys = new Set<string>();
    private _countLabel: Label | null = null;
    private _okBtn: DialogActionButtonResult | null = null;
    private readonly _rowReveal = new RowRevealRunner(this);

    onDestroy() {
        this._rowReveal.stop();
    }

    update(dt: number) {
        this._rowReveal.tick(dt);
    }

    init(
        opts: {
            tileFaces: Array<SpriteFrame | null>;
            panelBg: SpriteFrame | null;
            actionButtons?: DialogActionButtonSprites | null;
            shopEnabled?: boolean;
            shopGroups?: ShopCatalogGroup[];
            deckEntries?: DeckEntry[];
            epicItems?: EpicDeckItem[];
            onSaved?: (ids: number[]) => void;
            onClose?: () => void;
        },
        pw: number,
        ph: number,
    ) {
        this._opts = {
            ...opts,
            shopEnabled: !!opts.shopEnabled,
            actionButtons: opts.actionButtons ?? null,
            epicItems: opts.epicItems ?? [],
        };
        this._build(pw, ph);
    }

    private _close() {
        this._opts.onClose?.();
        if (this.node?.isValid) this.node.destroy();
    }

    private _selectionCount(): number {
        return this._opts.shopEnabled ? this._selectedShopKeys.size : this._selectedIds.size;
    }

    private _build(pw: number, ph: number) {
        const dim = new Node('Dim');
        dim.setParent(this.node);
        const dUt = dim.addComponent(UITransform);
        dUt.setContentSize(pw, ph);
        const dW = dim.addComponent(Widget);
        dW.isAlignTop = dW.isAlignBottom = dW.isAlignLeft = dW.isAlignRight = true;
        dW.top = dW.bottom = dW.left = dW.right = 0;
        dW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        dW.updateAlignment();
        addCenterFillRect(dim, pw, ph, C_DIM);
        const dimBtn = dim.addComponent(Button);
        dimBtn.transition = Button.Transition.NONE;
        dim.on(Button.EventType.CLICK, () => this._close(), this);

        const shopOn = this._opts.shopEnabled;
        const faces = this._opts.tileFaces ?? [];
        const deckEntries = this._opts.deckEntries ?? [];
        const shopGroups = this._opts.shopGroups ?? [];

        const availableCount = shopOn
            ? deckEntries.length + (this._opts.epicItems?.length ?? 0)
            : getDeckSelectableTypeIds(faces, false).length;

        if (availableCount < MIN_DECK_TYPE_COUNT) {
            const panelW = getDialogPanelWidthFromParent(this.node);
            const panelH = Math.min(560, ph - 48);
            const panel = mkDialogPanelShell(this.node, panelW, panelH);
            const bgOpts = { bgHeightExtra: DECK_BG_TEXTURE_STRETCH_H };
            applyDialogPanelBackground(panel, panelW, panelH, this._opts.panelBg, bgOpts);
            const tip = new Node('Tip');
            tip.setParent(panel);
            tip.addComponent(UITransform).setContentSize(panelW - 40, 200);
            tip.setPosition(0, 20, 0);
            const tl = tip.addComponent(Label);
            tl.string = shopOn
                ? `请先在「商店」获得至少 ${MIN_DECK_TYPE_COUNT} 种方块。当前已拥有 ${availableCount} 种。`
                : `当前在 GameApp 中已配置的方块贴图不足 ${MIN_DECK_TYPE_COUNT} 种，请至少配置 ${MIN_DECK_TYPE_COUNT} 个格子贴图后再配置卡组。`;
            tl.fontSize = 22;
            tl.color = Color.WHITE;
            tl.horizontalAlign = Label.HorizontalAlign.CENTER;
            tl.verticalAlign = Label.VerticalAlign.CENTER;
            tl.overflow = Label.Overflow.RESIZE_HEIGHT;
            mkDialogActionButton(
                panel,
                0,
                -panelH / 2 + 52,
                'close',
                '关闭',
                this._opts.actionButtons,
                () => this._close(),
                this,
            );
            return;
        }

        if (shopOn) {
            const epicItems = this._opts.epicItems ?? [];
            const epicKeys = epicItems.map((e) => makeEpicShopKey(e.id));
            const entryKeys = [
                ...deckEntries.map((e) => String(e.shopKey)),
                ...epicKeys,
            ];
            const initialKeys = loadDeckShopKeysRaw(shopGroups, entryKeys);
            for (let i = 0; i < initialKeys.length; i++) {
                const k = String(initialKeys[i]);
                if (entryKeys.indexOf(k) >= 0) this._selectedShopKeys.add(k);
            }
            // 默认选中前 30 种（列表顺序 = 赠送顺序；史诗排在后面不默认勾）
            if (this._selectedShopKeys.size < MIN_DECK_TYPE_COUNT) {
                for (let i = 0; i < entryKeys.length && this._selectedShopKeys.size < MIN_DECK_TYPE_COUNT; i++) {
                    this._selectedShopKeys.add(entryKeys[i]);
                }
                saveDeckShopKeys([...this._selectedShopKeys]);
            }
        } else {
            const available = getConfiguredTypeIds(faces);
            const initial = loadDeckTypeIdsRaw(faces, false);
            const allow = new Set(available);
            for (const id of initial) {
                if (allow.has(id)) this._selectedIds.add(id);
            }
            if (this._selectedIds.size < MIN_DECK_TYPE_COUNT) {
                for (let i = 0; i < available.length && this._selectedIds.size < MIN_DECK_TYPE_COUNT; i++) {
                    this._selectedIds.add(available[i]);
                }
                saveDeckTypeIds([...this._selectedIds]);
            }
        }

        const gridItems: DeckGridItem[] = shopOn
            ? deckEntries.map((e) => ({ key: e.shopKey, sf: e.sprite }))
            : getConfiguredTypeIds(faces).map((id) => ({
                  key: id,
                  sf: faces[id - 1]!,
              }));

        const sections = this._buildDeckSections(shopOn, shopGroups, gridItems, faces);
        const epicItems = this._opts.epicItems ?? [];
        if (epicItems.length > 0) {
            sections.unshift({
                title: '史诗方块',
                items: epicItems.map((e) => ({
                    key: makeEpicShopKey(e.id),
                    sf: e.sprite,
                })),
            });
        }

        const panelW = getDialogPanelWidthFromParent(this.node);
        const maxOuterH = Math.min(ph - 48, 920);
        const innerW = panelW - PANEL_PAD_X * 2;
        let cols = Math.floor((innerW + CELL_GAP) / (CELL_FACE + CELL_GAP));
        cols = Math.max(2, Math.min(8, cols));

        const contentH = this._computeDeckContentHeight(sections, cols);
        const viewH = Math.min(contentH, Math.max(200, maxOuterH - TITLE_AREA - FOOTER_AREA - 16));
        const panelH = Math.min(maxOuterH, TITLE_AREA + viewH + FOOTER_AREA);

        const panel = mkDialogPanelShell(this.node, panelW, panelH);
        const contentW = panelW - PANEL_PAD_X * 2;
        const bgOpts = { bgHeightExtra: DECK_BG_TEXTURE_STRETCH_H };
        applyDialogPanelBackground(panel, panelW, panelH, this._opts.panelBg, bgOpts);
        this.scheduleOnce(() => {
            if (!panel.isValid) return;
            refreshDialogPanelBackgroundSize(panel, panelW, panelH, this._opts.panelBg, bgOpts);
        }, 0);

        const titleN = new Node('Title');
        titleN.setParent(panel);
        titleN.setPosition(0, panelH / 2 - 36, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 24, 40);
        const title = titleN.addComponent(Label);
        title.string = '配置卡组';
        title.fontSize = 26;
        title.color = C_ACCENT;
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(title);

        const footY = -panelH / 2 + 56;
        const topGridY = panelH / 2 - TITLE_AREA;
        const scrollCenterY = (topGridY + (footY + 70)) / 2;

        const scrollRoot = new Node('GridScroll');
        scrollRoot.setParent(panel);
        scrollRoot.setPosition(0, scrollCenterY, 0);
        const viewW = contentW;
        const sUt = scrollRoot.addComponent(UITransform);
        sUt.setContentSize(viewW, viewH);

        const viewNode = new Node('view');
        viewNode.setParent(scrollRoot);
        const vUt = viewNode.addComponent(UITransform);
        vUt.setContentSize(viewW, viewH);
        const mask = viewNode.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        const content = new Node('content');
        content.setParent(viewNode);
        const cUt = content.addComponent(UITransform);
        cUt.setContentSize(innerW, contentH);

        const scroll = scrollRoot.addComponent(ScrollView);
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.content = content;
        scroll.elastic = true;
        scroll.bounceDuration = 0.2;

        scroll.scrollToTop(0);

        const cntN = new Node('Count');
        cntN.setParent(panel);
        cntN.setPosition(0, footY + 28, 0);
        cntN.addComponent(UITransform).setContentSize(panelW - 40, 36);
        this._countLabel = cntN.addComponent(Label);
        this._countLabel.fontSize = 20;
        this._countLabel.color = new Color(0xe0, 0xe1, 0xdd, 255);
        this._countLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._countLabel.verticalAlign = Label.VerticalAlign.CENTER;

        this._okBtn = mkDialogActionButton(
            panel,
            -110,
            footY - 28,
            'ok',
            '确定',
            this._opts.actionButtons,
            () => {
                if (!isDeckSelectionValid(this._selectionCount())) return;
                if (shopOn && shopGroups.length > 0) {
                    const keys = [...this._selectedShopKeys];
                    saveDeckShopKeys(keys);
                    const epicSprites: Record<string, SpriteFrame> = Object.create(null);
                    const epics = this._opts.epicItems ?? [];
                    for (let i = 0; i < epics.length; i++) {
                        const e = epics[i];
                        epicSprites[makeEpicShopKey(e.id)] = e.sprite;
                    }
                    const ids = deckShopKeysToTypeIds(keys, shopGroups, epicSprites);
                    trackDeckConfig({ mode: 'shop_keys', count: keys.length, shopKeys: keys, typeIds: ids });
                    this._opts.onSaved?.(ids);
                } else {
                    const ids = [...this._selectedIds].sort((a, b) => a - b);
                    saveDeckTypeIds(ids);
                    trackDeckConfig({ mode: 'type_ids', count: ids.length, typeIds: ids });
                    this._opts.onSaved?.(ids);
                }
                this._close();
            },
            this,
        );

        mkDialogActionButton(
            panel,
            110,
            footY - 28,
            'cancel',
            '取消',
            this._opts.actionButtons,
            () => this._close(),
            this,
        );

        this._refreshFooter();

        const rowFns: Array<() => void> = [];
        let yCursor = contentH / 2 - DECK_CONTENT_TOP_PAD;
        for (const sec of sections) {
            const shell = this._mkDeckGroupShell(content, innerW, yCursor, sec, cols, shopOn);
            yCursor = shell.nextY;
            this._appendDeckRowJobs(rowFns, sec, cols, shell.grid, shell.gridW, shell.gridH, shopOn);
        }
        this._rowReveal.start(rowFns);
    }

    private _appendDeckRowJobs(
        rowFns: Array<() => void>,
        section: DeckSection,
        cols: number,
        grid: Node,
        gridW: number,
        gridH: number,
        shopOn: boolean,
    ) {
        const originX = -gridW / 2 + CELL_FACE / 2;
        const originY = gridH / 2 - CELL_FACE / 2;
        const rowCount = Math.max(1, Math.ceil(section.items.length / cols));
        for (let row = 0; row < rowCount; row++) {
            const rowIndex = row;
            rowFns.push(() => {
                if (!grid.isValid) return;
                for (let col = 0; col < cols; col++) {
                    const idx = rowIndex * cols + col;
                    if (idx >= section.items.length) break;
                    const item = section.items[idx];
                    const bx = originX + col * (CELL_FACE + CELL_GAP);
                    const by = originY - rowIndex * (CELL_FACE + CELL_GAP);
                    this._mkDeckCell(grid, bx, by, item, shopOn, true);
                }
            });
        }
    }

    private _playDeckCellPop(cellRoot: Node, bx: number, by: number) {
        const popDy = CELL_FACE * 0.35;
        cellRoot.setPosition(bx, by + popDy, 0);
        cellRoot.setScale(0.55, 0.55, 1);
        const op = cellRoot.getComponent(UIOpacity) ?? cellRoot.addComponent(UIOpacity);
        op.opacity = 48;
        tween(cellRoot).stop();
        tween(op).stop();
        tween(cellRoot)
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

    private _buildDeckSections(
        shopOn: boolean,
        shopGroups: ShopCatalogGroup[],
        gridItems: DeckGridItem[],
        faces: Array<SpriteFrame | null>,
    ): DeckSection[] {
        if (shopGroups.length === 0) {
            return [{ title: '方块类型', items: gridItems }];
        }
        const sections: DeckSection[] = [];
        if (shopOn) {
            const byKey = new Map(gridItems.map((it) => [String(it.key), it]));
            for (const g of shopGroups) {
                const items: DeckGridItem[] = [];
                for (const it of g.items) {
                    const found = byKey.get(it.shopKey);
                    if (found) items.push(found);
                }
                if (items.length > 0) sections.push({ title: g.title, items });
            }
        } else {
            const assigned = new Set<string | number>();
            for (const g of shopGroups) {
                const items: DeckGridItem[] = [];
                for (const item of gridItems) {
                    if (assigned.has(item.key)) continue;
                    const id = Number(item.key);
                    const face = faces[id - 1];
                    const inGroup = g.items.some((it) => it.sprite === face || it.sprite === item.sf);
                    if (inGroup) {
                        items.push(item);
                        assigned.add(item.key);
                    }
                }
                if (items.length > 0) sections.push({ title: g.title, items });
            }
            const rest = gridItems.filter((it) => !assigned.has(it.key));
            if (rest.length > 0) sections.push({ title: '其他', items: rest });
        }
        return sections.length > 0 ? sections : [{ title: '方块类型', items: gridItems }];
    }

    private _deckGridH(rows: number): number {
        return rows * CELL_FACE + Math.max(0, rows - 1) * CELL_GAP;
    }

    private _computeDeckContentHeight(sections: DeckSection[], cols: number): number {
        let h = DECK_CONTENT_TOP_PAD;
        for (const sec of sections) {
            const rows = Math.max(1, Math.ceil(sec.items.length / cols));
            h += DECK_GROUP_TITLE_H + this._deckGridH(rows) + DECK_GROUP_SECTION_GAP;
        }
        return h;
    }

    private _mkDeckGroupShell(
        parent: Node,
        innerW: number,
        topY: number,
        section: DeckSection,
        cols: number,
        _shopOn: boolean,
    ): { grid: Node; gridW: number; gridH: number; nextY: number } {
        const titleN = new Node(`Title_${section.title}`);
        titleN.setParent(parent);
        titleN.setPosition(0, topY - DECK_GROUP_TITLE_H / 2, 0);
        titleN.addComponent(UITransform).setContentSize(innerW, DECK_GROUP_TITLE_H);
        const tl = titleN.addComponent(Label);
        tl.string = section.title;
        tl.fontSize = 20;
        tl.color = C_ACCENT;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        applyLabelBlackOutline(tl);

        const rows = Math.max(1, Math.ceil(section.items.length / cols));
        const gridH = this._deckGridH(rows);
        const gridW = cols * CELL_FACE + Math.max(0, cols - 1) * CELL_GAP;

        const grid = new Node(`Grid_${section.title}`);
        grid.setParent(parent);
        grid.setPosition(0, topY - DECK_GROUP_TITLE_H - gridH / 2 - 4, 0);
        grid.addComponent(UITransform).setContentSize(gridW, gridH);

        return {
            grid,
            gridW,
            gridH,
            nextY: topY - DECK_GROUP_TITLE_H - gridH - DECK_GROUP_SECTION_GAP,
        };
    }

    private _mkDeckCell(
        parent: Node,
        bx: number,
        by: number,
        item: DeckGridItem,
        shopOn: boolean,
        animate = false,
    ) {
        const cellRoot = new Node(`T_${item.key}`);
        cellRoot.setParent(parent);
        cellRoot.addComponent(UITransform).setContentSize(CELL_FACE, CELL_FACE);
        if (animate) {
            this._playDeckCellPop(cellRoot, bx, by);
        } else {
            cellRoot.setPosition(bx, by, 0);
        }

        const faceN = new Node('Face');
        faceN.setParent(cellRoot);
        const r = item.sf.rect;
        const uw = Math.max(1, r.width);
        const uh = Math.max(1, r.height);
        faceN.addComponent(UITransform).setContentSize(uw, uh);
        const fsp = faceN.addComponent(Sprite);
        fsp.spriteFrame = item.sf;
        fsp.sizeMode = Sprite.SizeMode.TRIMMED;
        const faceBaseScale = Math.min(CELL_FACE / uw, CELL_FACE / uh);

        const border = new Node('Border');
        border.setParent(cellRoot);
        border.setSiblingIndex(0);
        border.addComponent(UITransform).setContentSize(CELL_FACE, CELL_FACE);
        const g = border.addComponent(Graphics);

        const selectable = item.selectable !== false;
        const isSelected = () => {
            if (!selectable) return true;
            return shopOn
                ? this._selectedShopKeys.has(String(item.key))
                : this._selectedIds.has(Number(item.key));
        };

        const drawSel = (on: boolean) => {
            const half = CELL_FACE / 2;
            const r = 8;
            g.clear();
            if (on) {
                const pad = 3;
                g.fillColor = C_DECK_SEL_GLOW;
                g.roundRect(-half + pad, -half + pad, CELL_FACE - pad * 2, CELL_FACE - pad * 2, r - 2);
                g.fill();
                g.lineWidth = DECK_SEL_BORDER_W;
                g.strokeColor = C_DECK_SEL_BORDER;
                g.roundRect(-half, -half, CELL_FACE, CELL_FACE, r);
                g.stroke();
                const inset = 5;
                g.lineWidth = 2;
                g.strokeColor = C_DECK_SEL_INNER;
                g.roundRect(-half + inset, -half + inset, CELL_FACE - inset * 2, CELL_FACE - inset * 2, r - 3);
                g.stroke();
                const fs = faceBaseScale * DECK_SEL_FACE_SCALE;
                faceN.setScale(fs, fs, 1);
                fsp.color = C_DECK_SEL_FACE;
            } else {
                g.lineWidth = DECK_UNSEL_BORDER_W;
                g.strokeColor = C_DECK_CELL_BORDER;
                g.roundRect(-half, -half, CELL_FACE, CELL_FACE, r);
                g.stroke();
                faceN.setScale(faceBaseScale, faceBaseScale, 1);
                fsp.color = Color.WHITE;
            }
        };
        drawSel(isSelected());

        if (!selectable) return;

        cellRoot.addComponent(Button);
        cellRoot.on(Button.EventType.CLICK, () => {
            if (shopOn) {
                const k = String(item.key);
                if (this._selectedShopKeys.has(k)) this._selectedShopKeys.delete(k);
                else {
                    if (this._selectedShopKeys.size >= MAX_DECK_TYPE_COUNT) return;
                    this._selectedShopKeys.add(k);
                }
            } else {
                const id = Number(item.key);
                if (this._selectedIds.has(id)) this._selectedIds.delete(id);
                else {
                    if (this._selectedIds.size >= MAX_DECK_TYPE_COUNT) return;
                    this._selectedIds.add(id);
                }
            }
            drawSel(isSelected());
            this._refreshFooter();
        }, this);
    }

    private _refreshFooter() {
        const n = this._selectionCount();
        if (this._countLabel) {
            this._countLabel.string = `已选 ${n} 种（${MIN_DECK_TYPE_COUNT}～${MAX_DECK_TYPE_COUNT} 种）`;
            this._countLabel.color = isDeckSelectionValid(n)
                ? new Color(0xa8, 0xd5, 0xba, 255)
                : new Color(0xff, 0xb4, 0xa2, 255);
        }
        if (this._okBtn) {
            setDialogOkEnabled(this._okBtn, isDeckSelectionValid(n));
        }
    }
}
