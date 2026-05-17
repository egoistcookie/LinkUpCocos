import { Button, Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';

const C_FALLBACK_OK = new Color(0x2d, 0x6a, 0x4f, 255);
const C_FALLBACK_CANCEL = new Color(0x41, 0x5a, 0x77, 255);

export type DialogActionButtonSprites = {
    okNormal: SpriteFrame | null;
    okPressed: SpriteFrame | null;
    cancelNormal: SpriteFrame | null;
    cancelPressed: SpriteFrame | null;
    closeNormal: SpriteFrame | null;
    closePressed: SpriteFrame | null;
};

function addCenterFillRect(node: Node, w: number, h: number, fill: Color): Graphics {
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
    return g;
}

function mountSpriteButton(
    node: Node,
    bw: number,
    bh: number,
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

export type DialogActionButtonResult = {
    node: Node;
    sprite: Sprite | null;
    graphics: Graphics | null;
    label: Label | null;
};

/** 确定 / 取消 / 关闭；未配置贴图时用纯色底 + 文字 */
export function mkDialogActionButton(
    parent: Node,
    x: number,
    y: number,
    kind: 'ok' | 'cancel' | 'close',
    text: string,
    sprites: DialogActionButtonSprites | null | undefined,
    onClick: () => void,
    host: { node: Node },
    w = 160,
    h = 48,
): DialogActionButtonResult {
    const n = new Node(`Btn_${text}`);
    n.setParent(parent);
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(w, h);

    let sfNormal: SpriteFrame | null = null;
    let sfPressed: SpriteFrame | null = null;
    let fill = C_FALLBACK_OK;
    if (kind === 'cancel') fill = C_FALLBACK_CANCEL;
    if (kind === 'close') fill = C_FALLBACK_OK;

    if (sprites) {
        if (kind === 'ok') {
            sfNormal = sprites.okNormal;
            sfPressed = sprites.okPressed;
        } else if (kind === 'cancel') {
            sfNormal = sprites.cancelNormal;
            sfPressed = sprites.cancelPressed;
        } else {
            sfNormal = sprites.closeNormal;
            sfPressed = sprites.closePressed;
        }
    }

    let sprite: Sprite | null = null;
    let graphics: Graphics | null = null;
    if (sfNormal) {
        n.addComponent(Sprite);
        mountSpriteButton(n, w, h, sfNormal, sfPressed);
        sprite = n.getComponent(Sprite);
    } else {
        graphics = addCenterFillRect(n, w, h, fill);
    }

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
    labN.active = !sfNormal;

    n.on(Button.EventType.CLICK, onClick, host);
    return { node: n, sprite, graphics, label: lab };
}

export function setDialogOkEnabled(result: DialogActionButtonResult, enabled: boolean) {
    const btn = result.node.getComponent(Button);
    if (btn) btn.interactable = enabled;
    if (result.sprite) {
        result.sprite.color = enabled ? Color.WHITE : new Color(140, 140, 140, 255);
    }
    if (result.graphics) {
        result.graphics.clear();
        result.graphics.fillColor = enabled ? C_FALLBACK_OK : new Color(0x55, 0x55, 0x55, 200);
        result.graphics.fillRect(-80, -24, 160, 48);
    }
}
