import { Camera, Label, Node, Sprite, UITransform } from 'cc';

/** 浏览器控制台过滤关键字：`[LinkUp]` */

const P = '[LinkUp]';

export function linkLog(tag: string, ...args: unknown[]) {
    console.log(`${P} ${tag}`, ...args);
}

export function linkWarn(tag: string, ...args: unknown[]) {
    console.warn(`${P} ${tag}`, ...args);
}

/** 节点渲染/变换关键信息，便于对照「白屏无按钮」 */
export function linkDumpNode(tag: string, n: Node | null) {
    if (!n) {
        linkLog(tag, { node: null });
        return;
    }
    const ut = n.getComponent(UITransform);
    const sp = n.getComponent(Sprite);
    const lab = n.getComponent(Label);
    const wp = n.worldPosition;
    linkLog(tag, {
        path: nodePath(n),
        active: n.active,
        activeInHierarchy: n.activeInHierarchy,
        layerHex: `0x${n.layer.toString(16)}`,
        localPos: { x: n.position.x, y: n.position.y, z: n.position.z },
        worldPos: { x: wp.x, y: wp.y, z: wp.z },
        worldScale: { x: n.worldScale.x, y: n.worldScale.y },
        uiTransform: ut
            ? { w: ut.width, h: ut.height, anchorX: ut.anchorX, anchorY: ut.anchorY }
            : null,
        sprite: sp
            ? {
                  enabled: sp.enabled,
                  color: `${sp.color?.r},${sp.color?.g},${sp.color?.b}`,
                  hasFrame: !!sp.spriteFrame,
                  sizeMode: sp.sizeMode,
              }
            : null,
        label: lab ? { string: lab.string, fontSize: lab.fontSize, enabled: lab.enabled } : null,
        childNames: n.children.map((c) => c.name),
    });
}

/** 节点 layer 是否落在摄像机 visibility 里 */
export function linkLayerVsCamera(tag: string, n: Node | null, cam: Camera | null) {
    if (!n || !cam) {
        linkLog(tag, { ok: false, reason: !n ? 'no-node' : 'no-camera' });
        return;
    }
    const hit = (n.layer & cam.visibility) !== 0;
    linkLog(tag, {
        nodeLayerHex: `0x${n.layer.toString(16)}`,
        camVisibilityHex: `0x${cam.visibility.toString(16)}`,
        layerHitCameraVisibility: hit,
    });
}

/** 从节点向上拼路径，便于对照层级 */
export function nodePath(n: Node | null, maxDepth = 12): string {
    if (!n) return '(null)';
    const parts: string[] = [];
    let cur: Node | null = n;
    let d = 0;
    while (cur && d < maxDepth) {
        parts.unshift(cur.name);
        cur = cur.parent;
        d++;
    }
    return parts.join('/') || '(null)';
}
