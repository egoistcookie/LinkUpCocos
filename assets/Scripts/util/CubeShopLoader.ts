import { assetManager, SpriteFrame, AssetManager } from 'cc';
import type { ShopSpriteGroupKey } from './ShopCatalog';
import { linkLog, linkWarn } from './LinkUpDebug';

export type CubeShopSpriteGroups = Record<ShopSpriteGroupKey, SpriteFrame[]>;

const BUNDLE_NAME = 'cube';

function emptyGroups(): CubeShopSpriteGroups {
    return {
        landAnimals: [],
        aquaticAnimals: [],
        fruits: [],
        snacks: [],
        vegetables: [],
        pastries: [],
    };
}

/** 按 cube 包内资源路径/文件名归类到商店分组 */
export function classifyCubeSpriteName(assetName: string): ShopSpriteGroupKey | null {
    const name = assetName || '';
    if (name.includes('暗牌') || name.includes('明牌') || name.includes('star')) return null;
    if (name.includes('鱼类')) return 'aquaticAnimals';
    if (name.includes('动物')) return 'landAnimals';
    if (name.includes('蔬菜')) return 'vegetables';
    if (name.includes('面点') || name.includes('甜点')) return 'pastries';
    if (name.includes('零食')) return 'snacks';
    if (name.includes('水果')) return 'fruits';
    return null;
}

function assetBaseName(pathOrName: string): string {
    const p = (pathOrName || '').replace(/\\/g, '/');
    const noSf = p.replace(/\/spriteFrame$/i, '');
    const seg = noSf.split('/').filter(Boolean);
    return seg.length ? seg[seg.length - 1] : noSf;
}

function sortKey(name: string): string {
    const m = name.match(/_(\d+)/);
    const n = m ? Number(m[1]) : 0;
    return `${name.replace(/_\d+.*/, '')}_${String(n).padStart(4, '0')}`;
}

/**
 * 加载 cube Asset Bundle（微信小游戏为独立分包），并按路径名归类方块贴图。
 * 编辑器挂在 GameApp 上的引用若因分包未加载而为空，可用此结果重建商店。
 */
export function loadCubeShopSpriteGroups(done: (groups: CubeShopSpriteGroups) => void): void {
    const finish = (groups: CubeShopSpriteGroups) => {
        const summary = (Object.keys(groups) as ShopSpriteGroupKey[]).map((k) => `${k}:${groups[k].length}`);
        linkLog('CubeShopLoader', { summary });
        done(groups);
    };

    const collectFromBundle = (bundle: AssetManager.Bundle) => {
        type Named = { name: string; sf: SpriteFrame };
        const bucket: Record<ShopSpriteGroupKey, Named[]> = {
            landAnimals: [],
            aquaticAnimals: [],
            fruits: [],
            snacks: [],
            vegetables: [],
            pastries: [],
        };

        const infos = bundle.getDirWithPath('', SpriteFrame) ?? [];
        if (infos.length === 0) {
            // 回退：直接 loadDir，尽量用 sf.name
            bundle.loadDir('', SpriteFrame, (err, frames) => {
                const groups = emptyGroups();
                if (err || !frames) {
                    linkWarn('CubeShopLoader.loadDir', err || 'no frames');
                    finish(groups);
                    return;
                }
                for (const sf of frames) {
                    if (!sf) continue;
                    const name = assetBaseName(sf.name || '');
                    const key = classifyCubeSpriteName(name);
                    if (!key) continue;
                    bucket[key].push({ name, sf });
                }
                const out = emptyGroups();
                for (const k of Object.keys(bucket) as ShopSpriteGroupKey[]) {
                    bucket[k].sort((a, b) => (sortKey(a.name) < sortKey(b.name) ? -1 : 1));
                    out[k] = bucket[k].map((x) => x.sf);
                }
                finish(out);
            });
            return;
        }

        const paths = infos.map((info) => info.path);
        let pending = paths.length;
        if (pending === 0) {
            finish(emptyGroups());
            return;
        }
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const base = assetBaseName(path);
            const key = classifyCubeSpriteName(base);
            if (!key) {
                pending -= 1;
                if (pending <= 0) {
                    const out = emptyGroups();
                    for (const k of Object.keys(bucket) as ShopSpriteGroupKey[]) {
                        bucket[k].sort((a, b) => (sortKey(a.name) < sortKey(b.name) ? -1 : 1));
                        out[k] = bucket[k].map((x) => x.sf);
                    }
                    finish(out);
                }
                continue;
            }
            bundle.load(path, SpriteFrame, (err, sf) => {
                if (!err && sf) bucket[key].push({ name: base, sf });
                pending -= 1;
                if (pending <= 0) {
                    const out = emptyGroups();
                    for (const k of Object.keys(bucket) as ShopSpriteGroupKey[]) {
                        bucket[k].sort((a, b) => (sortKey(a.name) < sortKey(b.name) ? -1 : 1));
                        out[k] = bucket[k].map((x) => x.sf);
                    }
                    finish(out);
                }
            });
        }
    };

    const existing = assetManager.getBundle(BUNDLE_NAME);
    if (existing) {
        collectFromBundle(existing);
        return;
    }
    assetManager.loadBundle(BUNDLE_NAME, (err, bundle) => {
        if (err || !bundle) {
            linkWarn('CubeShopLoader.loadBundle', err || 'no bundle');
            finish(emptyGroups());
            return;
        }
        collectFromBundle(bundle);
    });
}

/** 编辑器配置与分包加载结果取更长的一侧，保证微信端也能凑齐种类 */
export function pickRicherSpriteList(
    editor: Array<SpriteFrame | null | undefined> | null | undefined,
    fromBundle: SpriteFrame[] | null | undefined,
): SpriteFrame[] {
    const e = (editor ?? []).filter((sf): sf is SpriteFrame => !!sf);
    const b = fromBundle ?? [];
    return b.length > e.length ? b : e;
}
