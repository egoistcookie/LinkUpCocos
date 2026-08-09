import { sys } from 'cc';

const PLAYER_ID_KEY = 'linkup_v1_player_id';

function genUuid(): string {
    const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    // 本地游客 ID；后续可换成微信 openId
    return `${Date.now().toString(16)}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}`;
}

/** 持久化玩家 ID；读写失败时返回临时 ID，不抛错 */
export function getOrCreatePlayerId(): string {
    try {
        const raw = sys.localStorage.getItem(PLAYER_ID_KEY) as unknown;
        const s = raw == null ? '' : String(raw).trim();
        if (s) return s;
        const id = genUuid();
        sys.localStorage.setItem(PLAYER_ID_KEY, id);
        return id;
    } catch {
        return genUuid();
    }
}
