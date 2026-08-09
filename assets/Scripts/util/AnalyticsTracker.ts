import { sys } from 'cc';
import { getOrCreatePlayerId } from './PlayerIdStorage';
import type { PropKind } from './PlayerResourceStorage';

const BASE_URL = 'https://www.egoistcookie.top/api/linkup';
const TIMEOUT_MS = 8000;

type PropsUsed = Record<PropKind, number>;
type LevelResult = 'win' | 'abort' | 'fail';

type LevelSession = {
    sessionId: string;
    level: number;
    startAt: number;
    propsUsed: PropsUsed;
};

let _session: LevelSession | null = null;

function emptyProps(): PropsUsed {
    return { hint: 0, refresh: 0, eliminate: 0 };
}

function genId(): string {
    const a = Date.now().toString(36);
    const b = Math.random().toString(36).slice(2, 10);
    const c = Math.random().toString(36).slice(2, 10);
    return `${a}-${b}-${c}`;
}

function platformTag(): string {
    try {
        // 微信小游戏
        if (typeof globalThis !== 'undefined' && (globalThis as { wx?: unknown }).wx) {
            return 'wechat';
        }
    } catch {
        /* ignore */
    }
    return String(sys.platform ?? 'unknown');
}

/** 失败不影响游戏：吞掉所有异常 */
function postJson(path: string, body: Record<string, unknown>): void {
    try {
        const url = `${BASE_URL}${path}`;
        const payload = JSON.stringify(body);
        const wxApi = (globalThis as { wx?: { request?: (opt: Record<string, unknown>) => void } }).wx;
        if (wxApi?.request) {
            wxApi.request({
                url,
                method: 'POST',
                data: body,
                header: { 'Content-Type': 'application/json' },
                timeout: TIMEOUT_MS,
                fail: () => {
                    /* ignore */
                },
            });
            return;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = TIMEOUT_MS;
            xhr.onerror = () => {
                /* ignore */
            };
            xhr.ontimeout = () => {
                /* ignore */
            };
            xhr.send(payload);
            return;
        }
        if (typeof fetch === 'function') {
            void fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
            }).catch(() => {
                /* ignore */
            });
        }
    } catch {
        /* ignore */
    }
}

function safeCall(fn: () => void): void {
    try {
        fn();
    } catch {
        /* ignore */
    }
}

/** 开局：新增一条对局记录；若上一局未结算则先按 abort 收尾 */
export function trackLevelStart(level: number, extra?: Record<string, unknown>): void {
    safeCall(() => {
        if (_session) {
            trackLevelEnd('abort', { reason: 'restart_without_settle' });
        }
        const sessionId = genId();
        const lv = Math.max(1, Math.floor(level));
        _session = {
            sessionId,
            level: lv,
            startAt: Date.now(),
            propsUsed: emptyProps(),
        };
        postJson('/level/start', {
            session_id: sessionId,
            player_id: getOrCreatePlayerId(),
            level: lv,
            extra: {
                platform: platformTag(),
                ...(extra || {}),
            },
        });
    });
}

/** 结算/退出：更新原记录 */
export function trackLevelEnd(
    result: LevelResult,
    data?: {
        connectCount?: number;
        coinsEarned?: number;
        reason?: string;
        extra?: Record<string, unknown>;
    },
): void {
    safeCall(() => {
        const s = _session;
        if (!s) return;
        _session = null;
        const durationMs = Math.max(0, Date.now() - s.startAt);
        postJson('/level/end', {
            session_id: s.sessionId,
            player_id: getOrCreatePlayerId(),
            result,
            duration_ms: durationMs,
            connect_count: data?.connectCount ?? null,
            coins_earned: data?.coinsEarned ?? null,
            props_used: { ...s.propsUsed },
            extra: {
                level: s.level,
                reason: data?.reason ?? null,
                platform: platformTag(),
                ...(data?.extra || {}),
            },
        });
    });
}

/** 本关内道具使用计数（随结算一并上报） */
export function trackPropUse(kind: PropKind): void {
    safeCall(() => {
        if (!_session) return;
        if (kind !== 'hint' && kind !== 'refresh' && kind !== 'eliminate') return;
        _session.propsUsed[kind] += 1;
    });
}

export function trackBuyBlock(shopKey: string, price: number, coinsAfter: number): void {
    safeCall(() => {
        postJson('/event', {
            player_id: getOrCreatePlayerId(),
            event_type: 'buy_block',
            payload: {
                shop_key: String(shopKey),
                price,
                coins_after: coinsAfter,
                platform: platformTag(),
            },
        });
    });
}

export function trackBuyProp(kind: PropKind, price: number, coinsAfter: number): void {
    safeCall(() => {
        postJson('/event', {
            player_id: getOrCreatePlayerId(),
            event_type: 'buy_prop',
            payload: {
                prop: kind,
                price,
                coins_after: coinsAfter,
                platform: platformTag(),
            },
        });
    });
}

export function trackDeckConfig(payload: {
    mode: 'shop_keys' | 'type_ids';
    count: number;
    shopKeys?: string[];
    typeIds?: number[];
}): void {
    safeCall(() => {
        postJson('/event', {
            player_id: getOrCreatePlayerId(),
            event_type: 'deck_config',
            payload: {
                ...payload,
                platform: platformTag(),
            },
        });
    });
}
