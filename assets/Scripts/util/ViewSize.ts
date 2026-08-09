import { Canvas, Node, screen, Size, sys, UITransform, view } from 'cc';
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

/** 防止换算异常把顶栏推得过远（约半个顶栏高） */
const SAFE_TOP_MAX = 64;
/** 基准收紧（iPhone X 档约贴合） */
const SAFE_TOP_TIGHTEN_BASE = 12;
/** 大于该 raw 时再按超出量加收（12/14 Max 等 safeArea 偏大） */
const SAFE_TOP_TIGHTEN_REF = 47;

type WxTopInfo = {
    designTop: number;
    statusBarPx: number;
    safeTopPx: number;
    isIOS: boolean;
    /** 未缩放像素判断：是否真有刘海/挖孔（华为等仅状态栏不算） */
    hasNotch: boolean;
};

/**
 * 顶部安全区高度（设计分辨率）：仅真刘海/挖孔机下移；
 * iPad、华为等无刘海机贴顶（勿用设计分辨率 raw 误判，状态栏一放大就变 65）。
 */
export function getSafeAreaTopInset(): number {
    const vs = getStableVisibleSize();
    const engineTop = _engineSafeAreaTop(vs.height);
    const wx = _readWxTopInfo(vs.height);
    const raw = Math.max(engineTop, wx?.designTop ?? 0);
    const noNotch = _isPadLike() || (wx ? !wx.hasNotch : raw < 32);
    let tighten = 0;
    let inset = 0;
    if (!noNotch && raw > 0.5) {
        tighten = SAFE_TOP_TIGHTEN_BASE + Math.max(0, Math.round((raw - SAFE_TOP_TIGHTEN_REF) * 0.75));
        inset = Math.min(Math.max(0, Math.floor(raw) - tighten), SAFE_TOP_MAX);
    }
    if (sys.platform === sys.Platform.WECHAT_GAME || inset > 0 || raw > 0) {
        linkLog('SafeArea.topInset', {
            engineTop,
            wxTop: wx?.designTop ?? 0,
            statusBarPx: wx?.statusBarPx ?? 0,
            safeTopPx: wx?.safeTopPx ?? 0,
            isIOS: wx?.isIOS ?? false,
            hasNotch: wx?.hasNotch ?? null,
            raw,
            noNotch,
            tighten,
            inset,
            designH: vs.height,
            windowH: screen.windowSize.height,
        });
    }
    return inset;
}

/** iPad / 平板：无刘海，页眉贴屏幕顶 */
function _isPadLike(): boolean {
    const info = _wxSystemInfo();
    if (info) {
        const model = String(info.model ?? info.deviceModel ?? '');
        const system = String(info.system ?? '');
        if (/iPad/i.test(model) || /iPad/i.test(system)) return true;
    }
    const vs = getStableVisibleSize();
    const shortSide = Math.min(vs.width, vs.height);
    const longSide = Math.max(vs.width, vs.height);
    return shortSide >= 600 && longSide / shortSide < 1.65;
}

function _wxSystemInfo(): Record<string, unknown> | null {
    if (sys.platform !== sys.Platform.WECHAT_GAME) return null;
    try {
        const wxApi = (globalThis as unknown as { wx?: Record<string, unknown> }).wx;
        if (!wxApi) return null;
        const getWindowInfo = wxApi.getWindowInfo as (() => Record<string, unknown>) | undefined;
        const getDeviceInfo = wxApi.getDeviceInfo as (() => Record<string, unknown>) | undefined;
        const getSystemInfoSync = wxApi.getSystemInfoSync as (() => Record<string, unknown>) | undefined;
        const win = typeof getWindowInfo === 'function' ? getWindowInfo() : null;
        const dev = typeof getDeviceInfo === 'function' ? getDeviceInfo() : null;
        const sysInfo = typeof getSystemInfoSync === 'function' ? getSystemInfoSync() : null;
        if (!win && !dev && !sysInfo) return null;
        return { ...(sysInfo ?? {}), ...(dev ?? {}), ...(win ?? {}) };
    } catch {
        return null;
    }
}

/**
 * 用窗口像素判断刘海，再换算设计分辨率顶距。
 * Android/华为：safeTop≈statusBar 且不高 → 无刘海；勿把放大后的 designTop 当刘海。
 */
function _readWxTopInfo(designH: number): WxTopInfo | null {
    const info = _wxSystemInfo();
    if (!info) return null;
    const windowH = Number(info.windowHeight ?? info.screenHeight ?? 0);
    const scale = windowH > 1 ? designH / windowH : 1;
    const safe = info.safeArea as { top?: number } | undefined;
    const statusBarPx = Number(info.statusBarHeight ?? 0);
    const safeTopPx = Number(safe?.top ?? statusBarPx);
    const topPx = Math.max(
        Number.isFinite(statusBarPx) ? statusBarPx : 0,
        Number.isFinite(safeTopPx) ? safeTopPx : 0,
    );
    if (topPx <= 0) {
        return { designTop: 0, statusBarPx: 0, safeTopPx: 0, isIOS: false, hasNotch: false };
    }
    const model = String(info.model ?? info.deviceModel ?? '');
    const system = String(info.system ?? '');
    const isIOS = /iOS/i.test(system) || /iPhone/i.test(model);
    let hasNotch = false;
    if (isIOS) {
        // iPhone X 起状态栏/安全区顶约 ≥40
        hasNotch = safeTopPx >= 40 || statusBarPx >= 40;
    } else {
        // 安卓：仅状态栏（华为常见 24–40px 且 safeTop≈statusBar）不算刘海；
        // 挖孔/刘海通常 safeTop 明显高于 statusBar，或状态栏极高
        hasNotch = safeTopPx > statusBarPx + 6 || statusBarPx >= 48;
    }
    return {
        designTop: Math.floor(topPx * scale),
        statusBarPx: Number.isFinite(statusBarPx) ? statusBarPx : 0,
        safeTopPx: Number.isFinite(safeTopPx) ? safeTopPx : 0,
        isIOS,
        hasNotch,
    };
}

function _engineSafeAreaTop(designH: number): number {
    try {
        const safe = sys.getSafeAreaRect();
        if (!safe || !(safe.height > 1)) return 0;
        const top = designH - safe.y - safe.height;
        if (!Number.isFinite(top) || top <= 0.5) return 0;
        return Math.floor(top);
    } catch {
        return 0;
    }
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
