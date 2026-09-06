import { SpriteFrame, resources } from 'cc';
import { loadEpicCubeIds } from './PlayerResourceStorage';
import { linkWarn } from './LinkUpDebug';

/** resources/talo 下数字前缀塔罗牌定义 */
export type TarotCardDef = {
    /** 数字前缀，如 1、2 */
    index: number;
    /** 史诗方块资源名，如「小瓦」（对应 cube/小瓦） */
    cubeId: string;
    /** resources 路径，如 talo/1-小瓦 */
    taloFacePath: string;
    /** 文件基名，如 1-小瓦 */
    fileBase: string;
};

const TALO_DIR = 'talo';
const TALO_BACK_BASE = '塔罗牌-背面';
/** 仅匹配「数字-名称」如 1-小瓦 */
const NUMBERED_FACE_RE = /^(\d+)-(.+)$/;

function assetBaseName(pathOrName: string): string {
    const p = String(pathOrName ?? '')
        .replace(/\\/g, '/')
        .replace(/\/spriteFrame$/i, '');
    const seg = p.split('/').filter(Boolean);
    return seg.length ? seg[seg.length - 1] : p;
}

/**
 * 塔罗正面对应史诗方块名：
 * - talo/1-小瓦 → 小瓦
 * - talo/塔罗牌-小瓦1 → 小瓦1（旧格式兼容）
 */
export function tarotFacePathToCubeId(taloPath: string): string {
    const base = assetBaseName(taloPath);
    if (!base) return '';
    const m = base.match(NUMBERED_FACE_RE);
    if (m) return String(m[2] ?? '').trim();
    return base.replace(/^塔罗牌-/, '').trim();
}

function parseNumberedFace(fileBase: string): TarotCardDef | null {
    const base = assetBaseName(fileBase);
    if (!base || base === TALO_BACK_BASE) return null;
    const m = base.match(NUMBERED_FACE_RE);
    if (!m) return null;
    const index = Number(m[1]);
    const cubeId = String(m[2] ?? '').trim();
    if (!Number.isFinite(index) || index < 1 || !cubeId) return null;
    return {
        index,
        cubeId,
        fileBase: base,
        taloFacePath: `${TALO_DIR}/${base}`,
    };
}

function collectFromDirInfos(byIndex: Map<number, TarotCardDef>): void {
    const tryScan = (type?: typeof SpriteFrame) => {
        try {
            const infos = (type ? resources.getDirWithPath(TALO_DIR, type) : resources.getDirWithPath(TALO_DIR)) ?? [];
            for (let i = 0; i < infos.length; i++) {
                const def = parseNumberedFace(infos[i]?.path ?? '');
                if (def && !byIndex.has(def.index)) byIndex.set(def.index, def);
            }
        } catch (e) {
            linkWarn('TarotPool.getDirWithPath', e);
        }
    };
    tryScan(SpriteFrame);
    if (byIndex.size === 0) tryScan();
}

/**
 * 枚举 talo 目录下所有「数字-名称」塔罗正面（排除背面），按数字前缀升序。
 */
export function listNumberedTarotCards(done: (cards: TarotCardDef[]) => void): void {
    const byIndex = new Map<number, TarotCardDef>();

    const finish = () => {
        const cards = [...byIndex.values()].sort((a, b) => a.index - b.index);
        done(cards);
    };

    collectFromDirInfos(byIndex);
    if (byIndex.size > 0) {
        finish();
        return;
    }

    resources.loadDir(TALO_DIR, SpriteFrame, (err, frames) => {
        if (err || !frames) {
            linkWarn('TarotPool.loadDir', err || 'no frames');
            collectFromDirInfos(byIndex);
            finish();
            return;
        }
        collectFromDirInfos(byIndex);
        finish();
    });
}

/** 尚未获得对应史诗方块的塔罗牌（已按数字前缀升序） */
export function getUnownedTarotCards(
    cards: TarotCardDef[],
    ownedCubeIds?: string[] | null,
): TarotCardDef[] {
    const owned = new Set(
        (ownedCubeIds ?? loadEpicCubeIds()).map((x) => String(x ?? '').trim()).filter(Boolean),
    );
    return cards.filter((c) => c.cubeId && !owned.has(c.cubeId));
}

/**
 * 通关翻牌池：未获得牌按数字前缀取前两张。
 * - 0 张 → 空数组（应跳过翻牌）
 * - 1 张 → 返回 [a, a]（左右背面翻开同一张）
 * - ≥2 张 → 返回 [前1, 前2]
 */
export function buildTarotDrawPool(
    cards: TarotCardDef[],
    ownedCubeIds?: string[] | null,
): TarotCardDef[] {
    const unowned = getUnownedTarotCards(cards, ownedCubeIds);
    if (unowned.length === 0) return [];
    if (unowned.length === 1) return [unowned[0], unowned[0]];
    return [unowned[0], unowned[1]];
}

/**
 * 加载编号塔罗并为通关构建左右翻牌池（最多两张槽位）。
 */
export function loadTarotDrawPool(done: (pool: TarotCardDef[]) => void): void {
    listNumberedTarotCards((cards) => {
        done(buildTarotDrawPool(cards));
    });
}

/** 按史诗方块名查找对应塔罗定义（如「小瓦」→ 1-小瓦） */
export function findTarotCardByCubeId(
    cards: TarotCardDef[],
    cubeId: string,
): TarotCardDef | null {
    const id = String(cubeId ?? '').trim();
    if (!id) return null;
    for (let i = 0; i < cards.length; i++) {
        if (cards[i].cubeId === id) return cards[i];
    }
    return null;
}

/** 异步枚举 talo 后按方块名取对应塔罗 */
export function loadTarotCardByCubeId(
    cubeId: string,
    done: (card: TarotCardDef | null) => void,
): void {
    listNumberedTarotCards((cards) => {
        done(findTarotCardByCubeId(cards, cubeId));
    });
}
