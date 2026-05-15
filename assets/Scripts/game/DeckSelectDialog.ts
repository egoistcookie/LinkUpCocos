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
    UITransform,
    Widget,
} from 'cc';
import { getLayoutSizeForNode } from '../util/ViewSize';
import {
    getConfiguredTypeIds,
    loadDeckTypeIdsRaw,
    MIN_DECK_TYPE_COUNT,
    saveDeckTypeIds,
} from '../util/DeckSelectionStorage';

const C_PANEL = new Color(0x1b, 0x26, 0x3b, 245);
const C_DIM = new Color(0, 0, 0, 160);
const C_ACCENT = new Color(0xe9, 0xc4, 0x6a, 255);
const C_BTN = new Color(0x2d, 0x6a, 0x4f, 255);
const C_BTN_DISABLED = new Color(0x55, 0x55, 0x55, 200);

/** 卡组弹窗内每个方块预览边长（逻辑像素） */
const CELL_FACE = 100;
const CELL_GAP = 10;
const PANEL_PAD_X = 24;
const TITLE_AREA = 88;
const FOOTER_AREA = 132;

function addCenterFillRect(node: Node, w: number, h: number, fill: Color) {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
}

/**
 * 首页「配置卡组」弹窗：勾选至少 {@link MIN_DECK_TYPE_COUNT} 种已配置贴图的类型。
 * 通过静态方法挂到父节点上，关闭时销毁根节点。
 */
export class DeckSelectDialog extends Component {
    /**
     * @param parent 一般为 HomeRoot
     * @param onSaved 仅在点击确定且合法时调用
     */
    static open(
        parent: Node,
        opts: {
            tileFaces: Array<SpriteFrame | null>;
            panelBg: SpriteFrame | null;
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
        onSaved?: (ids: number[]) => void;
        onClose?: () => void;
    };

    private _selected = new Set<number>();
    private _countLabel: Label | null = null;
    private _okBtnNode: Node | null = null;
    private _okGraphics: Graphics | null = null;

    init(
        opts: {
            tileFaces: Array<SpriteFrame | null>;
            panelBg: SpriteFrame | null;
            onSaved?: (ids: number[]) => void;
            onClose?: () => void;
        },
        pw: number,
        ph: number,
    ) {
        this._opts = opts;
        this._build(pw, ph);
    }

    private _close() {
        this._opts.onClose?.();
        if (this.node?.isValid) this.node.destroy();
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

        const faces = this._opts.tileFaces ?? [];
        const available = getConfiguredTypeIds(faces);
        const initial = loadDeckTypeIdsRaw(faces);

        if (available.length < MIN_DECK_TYPE_COUNT) {
            const panelW = Math.min(640, pw - 32);
            const panelH = Math.min(560, ph - 48);
            const panel = this._mkPanelShell(panelW, panelH);
            if (!this._opts.panelBg) {
                addCenterFillRect(panel, panelW, panelH, C_PANEL);
            } else {
                const sp = panel.addComponent(Sprite);
                sp.spriteFrame = this._opts.panelBg;
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.color = Color.WHITE;
            }
            const tip = new Node('Tip');
            tip.setParent(panel);
            tip.addComponent(UITransform).setContentSize(panelW - 40, 200);
            tip.setPosition(0, 20, 0);
            const tl = tip.addComponent(Label);
            tl.string = `当前在 GameApp 中已配置的方块贴图不足 ${MIN_DECK_TYPE_COUNT} 种，请至少配置 ${MIN_DECK_TYPE_COUNT} 个格子贴图后再配置卡组。`;
            tl.fontSize = 22;
            tl.color = Color.WHITE;
            tl.horizontalAlign = Label.HorizontalAlign.CENTER;
            tl.verticalAlign = Label.VerticalAlign.CENTER;
            tl.overflow = Label.Overflow.RESIZE_HEIGHT;

            this._mkTextButton(panel, 0, -panelH / 2 + 52, '关闭', C_BTN, () => this._close());
            return;
        }

        const allow = new Set(available);
        for (const id of initial) {
            if (allow.has(id)) this._selected.add(id);
        }

        const maxOuterW = Math.min(720, pw - 32);
        const maxOuterH = Math.min(ph - 48, 920);
        const innerW = maxOuterW - PANEL_PAD_X * 2;
        let cols = Math.floor((innerW + CELL_GAP) / (CELL_FACE + CELL_GAP));
        cols = Math.max(2, Math.min(8, cols));
        const rows = Math.max(1, Math.ceil(available.length / cols));
        const gridW = cols * CELL_FACE + Math.max(0, cols - 1) * CELL_GAP;
        const gridH = rows * CELL_FACE + Math.max(0, rows - 1) * CELL_GAP;

        const panelW = Math.min(maxOuterW, gridW + PANEL_PAD_X * 2);
        const viewH = Math.min(gridH, Math.max(200, maxOuterH - TITLE_AREA - FOOTER_AREA - 16));
        const panelH = Math.min(maxOuterH, TITLE_AREA + viewH + FOOTER_AREA);

        const panel = this._mkPanelShell(panelW, panelH);

        if (!this._opts.panelBg) {
            addCenterFillRect(panel, panelW, panelH, C_PANEL);
        } else {
            const sp = panel.addComponent(Sprite);
            sp.spriteFrame = this._opts.panelBg;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.color = Color.WHITE;
        }

        const titleN = new Node('Title');
        titleN.setParent(panel);
        titleN.setPosition(0, panelH / 2 - 36, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 24, 40);
        const title = titleN.addComponent(Label);
        title.string = `配置卡组（至少选择 ${MIN_DECK_TYPE_COUNT} 种）`;
        title.fontSize = 26;
        title.color = C_ACCENT;
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;

        const footY = -panelH / 2 + 56;
        const topGridY = panelH / 2 - TITLE_AREA;
        const scrollCenterY = (topGridY + (footY + 70)) / 2;

        const scrollRoot = new Node('GridScroll');
        scrollRoot.setParent(panel);
        scrollRoot.setPosition(0, scrollCenterY, 0);
        const viewW = panelW - PANEL_PAD_X * 2;
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
        cUt.setContentSize(gridW, gridH);

        const scroll = scrollRoot.addComponent(ScrollView);
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.content = content;
        scroll.elastic = true;
        scroll.bounceDuration = 0.2;

        const cell = CELL_FACE;
        const gap = CELL_GAP;
        const originX = -(((cols * cell + (cols - 1) * gap) >> 1) - cell / 2);
        const originY = gridH / 2 - cell / 2 - 4;

        let idx = 0;
        for (const id of available) {
            const sf = faces[id - 1];
            if (sf == null) continue;

            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const bx = originX + col * (cell + gap);
            const by = originY - row * (cell + gap);
            idx++;

            const cellRoot = new Node(`T${id}`);
            cellRoot.setParent(content);
            cellRoot.setPosition(bx, by, 0);
            cellRoot.addComponent(UITransform).setContentSize(cell, cell);

            const faceN = new Node('Face');
            faceN.setParent(cellRoot);
            const r = sf.rect;
            const uw = Math.max(1, r.width);
            const uh = Math.max(1, r.height);
            faceN.addComponent(UITransform).setContentSize(uw, uh);
            const fsp = faceN.addComponent(Sprite);
            fsp.spriteFrame = sf;
            fsp.sizeMode = Sprite.SizeMode.TRIMMED;
            const s = Math.min(CELL_FACE / uw, CELL_FACE / uh);
            faceN.setScale(s, s, 1);
            fsp.color = Color.WHITE;

            const border = new Node('Border');
            border.setParent(cellRoot);
            border.setSiblingIndex(0);
            const bUt = border.addComponent(UITransform);
            bUt.setContentSize(cell, cell);
            const g = border.addComponent(Graphics);

            const drawSel = (on: boolean) => {
                g.clear();
                g.lineWidth = on ? 4 : 2;
                g.strokeColor = on ? C_ACCENT : new Color(0x41, 0x5a, 0x77, 200);
                g.roundRect(-CELL_FACE / 2, -CELL_FACE / 2, CELL_FACE, CELL_FACE, 8);
                g.stroke();
            };
            drawSel(this._selected.has(id));

            cellRoot.addComponent(Button);
            cellRoot.on(Button.EventType.CLICK, () => {
                if (this._selected.has(id)) this._selected.delete(id);
                else this._selected.add(id);
                drawSel(this._selected.has(id));
                this._refreshFooter();
            }, this);
        }

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

        const ok = this._mkTextButton(panel, -110, footY - 8, '确定', C_BTN, () => {
            if (this._selected.size < MIN_DECK_TYPE_COUNT) return;
            const ids = [...this._selected].sort((a, b) => a - b);
            saveDeckTypeIds(ids);
            this._opts.onSaved?.(ids);
            this._close();
        });
        this._okBtnNode = ok;
        this._okGraphics = ok.getComponent(Graphics);

        this._mkTextButton(panel, 110, footY - 8, '取消', new Color(0x41, 0x5a, 0x77, 255), () => this._close());

        this._refreshFooter();
    }

    private _mkPanelShell(panelW: number, panelH: number): Node {
        const panel = new Node('Panel');
        panel.setParent(this.node);
        const pUt = panel.addComponent(UITransform);
        pUt.setContentSize(panelW, panelH);
        panel.addComponent(Widget);
        const pWg = panel.getComponent(Widget)!;
        pWg.isAlignHorizontalCenter = true;
        pWg.isAlignVerticalCenter = true;
        pWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        pWg.updateAlignment();
        return panel;
    }

    private _mkTextButton(
        parent: Node,
        x: number,
        y: number,
        text: string,
        fill: Color,
        onClick: () => void,
    ): Node {
        const n = new Node(`Btn_${text}`);
        n.setParent(parent);
        n.setPosition(x, y, 0);
        const w = 160;
        const h = 48;
        n.addComponent(UITransform).setContentSize(w, h);
        addCenterFillRect(n, w, h, fill);
        const btn = n.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        const labN = new Node('Label');
        labN.setParent(n);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.fontSize = 22;
        lab.color = Color.WHITE;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        n.on(Button.EventType.CLICK, onClick, this);
        return n;
    }

    private _refreshFooter() {
        const n = this._selected.size;
        if (this._countLabel) {
            this._countLabel.string = `已选 ${n} 种（至少 ${MIN_DECK_TYPE_COUNT} 种）`;
            this._countLabel.color =
                n >= MIN_DECK_TYPE_COUNT ? new Color(0xa8, 0xd5, 0xba, 255) : new Color(0xff, 0xb4, 0xa2, 255);
        }
        const ok = this._okBtnNode;
        if (ok && this._okGraphics) {
            const g = this._okGraphics;
            g.clear();
            const fill = n >= MIN_DECK_TYPE_COUNT ? C_BTN : C_BTN_DISABLED;
            g.fillColor = fill;
            g.fillRect(-80, -24, 160, 48);
        }
    }
}
