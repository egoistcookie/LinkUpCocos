import { Canvas, Node, screen, Size, UITransform, view } from 'cc';
import { linkLog, linkWarn, nodePath } from './LinkUpDebug';

/** 首帧 view 尺寸偶发为 0 时回退到 windowSize，避免 UI 宽高为 0 */
export function getStableVisibleSize(): Size {
    const vs = view.getVisibleSize();
    if (vs.width > 1 && vs.height > 1) {
        return vs;
    }
    const ws = screen.windowSize;
    const w = ws.width > 1 ? ws.width : 720;
    const h = ws.height > 1 ? ws.height : 1280;
    linkLog('ViewSize', 'getStableVisibleSize → fallback (view tiny/zero)', {
        view: { w: vs.width, h: vs.height },
        windowSize: { w: ws.width, h: ws.height },
        used: { w, h },
    });
    return new Size(w, h);
}

/**
 * 与 Canvas 根 UITransform 一致（屏幕空间-摄像机下以 Canvas 为准，避免与 getVisibleSize 不一致导致底栏出屏）
 */
export function getLayoutSizeForNode(node: Node | null): Size {
    let p: Node | null = node;
    while (p) {
        if (p.getComponent(Canvas)) {
            const ut = p.getComponent(UITransform);
            if (ut && ut.width > 1 && ut.height > 1) {
                return new Size(ut.width, ut.height);
            }
            linkWarn('ViewSize', 'getLayoutSizeForNode: Canvas UITransform 宽高过小', {
                canvas: p.name,
                w: ut?.width,
                h: ut?.height,
            });
            break;
        }
        p = p.parent;
    }
    linkWarn('ViewSize', 'getLayoutSizeForNode: 父链上无 Canvas，退回 getStableVisibleSize', nodePath(node));
    return getStableVisibleSize();
}
