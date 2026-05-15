import { SpriteFrame, sys } from 'cc';

/** 与 LinkUpBoard.TILE_SPRITE_SLOTS 一致 */
const TILE_SPRITE_SLOTS = 32;

const STORAGE_KEY = 'linkup_v1_deck_type_ids';

export const MIN_DECK_TYPE_COUNT = 30;

/** App 上已配置贴图的类型 id（1…TILE_SPRITE_SLOTS） */
export function getConfiguredTypeIds(tileFaces: Array<SpriteFrame | null> | null | undefined): number[] {
    const faces = tileFaces ?? [];
    const out: number[] = [];
    for (let i = 0; i < TILE_SPRITE_SLOTS; i++) {
        if (faces[i] != null) out.push(i + 1);
    }
    return out;
}

/** 已保存且仍有效的卡组（至少 30 种，且均有贴图）；无存储或无效时返回「当前全部已配置类型」 */
export function loadDeckTypeIdsForGame(tileFaces: Array<SpriteFrame | null> | null | undefined): number[] | null {
    const configured = getConfiguredTypeIds(tileFaces);
    if (configured.length < MIN_DECK_TYPE_COUNT) return null;
    let raw: unknown = null;
    try {
        const s = sys.localStorage.getItem(STORAGE_KEY);
        if (s) raw = JSON.parse(s);
    } catch {
        raw = null;
    }
    const allowed = new Set(configured);
    if (Array.isArray(raw)) {
        const uniq = [...new Set(raw.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort((a, b) => a - b);
        if (uniq.length >= MIN_DECK_TYPE_COUNT) return uniq;
    }
    return [...configured];
}

/** 读原始存储（可能无效），用于弹窗初始勾选 */
export function loadDeckTypeIdsRaw(tileFaces: Array<SpriteFrame | null> | null | undefined): number[] {
    const configured = getConfiguredTypeIds(tileFaces);
    const allowed = new Set(configured);
    let raw: unknown = null;
    try {
        const s = sys.localStorage.getItem(STORAGE_KEY);
        if (s) raw = JSON.parse(s);
    } catch {
        raw = null;
    }
    if (Array.isArray(raw)) {
        const uniq = [...new Set(raw.map((x) => Number(x)).filter((n) => allowed.has(n)))].sort((a, b) => a - b);
        if (uniq.length > 0) return uniq;
    }
    return [...configured];
}

export function saveDeckTypeIds(ids: number[]): void {
    try {
        sys.localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)].sort((a, b) => a - b)));
    } catch {
        /* 忽略 */
    }
}
