import {
    _decorator,
    AudioClip,
    AudioSource,
    Camera,
    Canvas,
    Color,
    Component,
    director,
    Layers,
    Node,
    Size,
    SpriteFrame,
    UITransform,
    Widget,
    view,
} from 'cc';
import { loadCubeShopSpriteGroups, loadCubeSpritesByNames, pickRicherSpriteList, type CubeShopSpriteGroups } from './util/CubeShopLoader';
import {
    GameView,
    type GameSfxConfig,
    type GameToolButtonSprites,
    type NoConnectDialogConfig,
} from './game/GameView';
import type { LevelClearDialogConfig } from './game/LevelClearOverlay';
import { HomeView, type HomeMainButtonSprites } from './game/HomeView';
import { DeckSelectDialog, type EpicDeckItem } from './game/DeckSelectDialog';
import { ShopDialog } from './game/ShopDialog';
import { TILE_SPRITE_SLOTS } from './game/LinkUpBoard';
import {
    collectDeckEntriesForUi,
    ensureDefaultDeckSelection,
    getConfiguredTypeIds,
    loadDeckShopKeysRaw,
    loadDeckTypeIdsForGame,
    MAX_DECK_TYPE_COUNT,
    MIN_DECK_TYPE_COUNT,
    saveDeckShopKeys,
    type DeckEntry,
} from './util/DeckSelectionStorage';
import {
    addCoins,
    ensureDefaultPropCounts,
    ensureDefaultShopOwnership,
    loadCoins,
    loadCurrentLevel,
    loadEpicCubeIds,
    saveCurrentLevel,
} from './util/PlayerResourceStorage';
import { trackLevelEnd } from './util/AnalyticsTracker';
import {
    buildShopCatalog,
    buildTileFacesFromDeckEntries,
    deckEntriesToTypeIds,
    getDefaultOwnedEntries,
    getDefaultOwnedShopKeys,
    hasShopCatalog,
    makeEpicShopKey,
    type ShopCatalogGroup,
} from './util/ShopCatalog';
import { type DialogActionButtonSprites } from './util/DialogActionButtons';
import { linkDumpNode, linkLayerVsCamera, linkLog, linkWarn, nodePath } from './util/LinkUpDebug';
import { getStableVisibleSize } from './util/ViewSize';

type CanvasComp = Canvas & { cameraComponent: Camera | null };

const { ccclass, property } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
    @property({ type: SpriteFrame, tooltip: '首页全屏背景图；不配置则首页无背景图，使用摄像机白底清屏' })
    homeBackground: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '游戏页全屏背景图；不配置则顶栏/棋盘/底栏各自底色' })
    gameBackground: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '游戏页顶栏页眉背景；不配置则顶栏无底色条' })
    gameHeaderBackground: SpriteFrame | null = null;

    @property({
        type: [SpriteFrame],
        tooltip: `棋盘格子贴图，共 ${TILE_SPRITE_SLOTS} 项：索引 0 对应 1 号类型；卡组模式由商店配置映射`,
    })
    tileFaceSprites: Array<SpriteFrame | null> = [];

    @property({ type: SpriteFrame, tooltip: '游戏页返回按钮（正常态）' })
    toolBtnBackNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页返回按钮（按下态）' })
    toolBtnBackPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页提示按钮（正常态）' })
    toolBtnHintNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页提示按钮（按下态）' })
    toolBtnHintPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页刷新按钮（正常态）' })
    toolBtnRefreshNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页刷新按钮（按下态）' })
    toolBtnRefreshPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页消除按钮（正常态）' })
    toolBtnEliminateNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '游戏页消除按钮（按下态）' })
    toolBtnEliminatePressed: SpriteFrame | null = null;

    @property({ type: AudioClip, tooltip: '连线成功消除一对时播放；不配置则不播放' })
    sfxConnect: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '选中棋盘方块时播放；不配置则不播放' })
    sfxSelect: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '点击提示道具时播放；不配置则不播放' })
    sfxHint: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '点击刷新道具时播放；不配置则不播放' })
    sfxRefresh: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '点击消除道具时播放；不配置则不播放' })
    sfxEliminate: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '通关结算弹窗出现时播放；不配置则不播放' })
    sfxLevelClear: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '通关抽卡翻开塔罗牌时播放；不配置则自动加载 sounds/升星' })
    sfxTarotFlip: AudioClip | null = null;
    @property({ type: AudioClip, tooltip: '游戏启动后循环播放的背景音乐；不配置则不播放' })
    bgm: AudioClip | null = null;

    @property({ type: SpriteFrame, tooltip: '通关结算弹窗底板图；不配置则用深色纯色块' })
    levelClearPanelBg: SpriteFrame | null = null;
    @property({ type: [SpriteFrame], tooltip: '通关结算上半屏循环庆祝动画帧（按顺序播放）' })
    levelClearAnimFrames: SpriteFrame[] = [];
    @property({ tooltip: '通关庆祝动画帧率（帧/秒）' })
    levelClearAnimFps = 12;
    @property({ type: SpriteFrame, tooltip: '通关结算「返回首页」按钮（正常态）' })
    levelClearBtnHomeNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '通关结算「返回首页」按钮（按下态）' })
    levelClearBtnHomePressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '通关结算「下一关」按钮（正常态）' })
    levelClearBtnNextNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '通关结算「下一关」按钮（按下态）' })
    levelClearBtnNextPressed: SpriteFrame | null = null;

    @property({ tooltip: '场上无可连对时弹窗主文案' })
    noConnectDialogMessage = '场上没有可连线方块，自动刷新';
    @property({ tooltip: '场上无可连对时弹窗副标题（可留空）' })
    noConnectDialogTitle = '';
    @property({ tooltip: '无可连对弹窗展示多少秒后自动洗牌（秒）' })
    noConnectDialogAutoDelay = 1.2;
    @property({ type: SpriteFrame, tooltip: '无可连对弹窗底板图；不配置则用深色纯色块' })
    noConnectDialogPanelBg: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '首页开始游戏按钮（正常态）；不配置则用纯色底+文字' })
    homeBtnStartNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '首页开始游戏按钮（按下态）' })
    homeBtnStartPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '首页配置卡组按钮（正常态）' })
    homeBtnDeckNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '首页配置卡组按钮（按下态）' })
    homeBtnDeckPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '首页商店按钮（正常态）' })
    homeBtnShopNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '首页商店按钮（按下态）' })
    homeBtnShopPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '配置卡组弹窗底板；不配置则用深色底板' })
    deckDialogPanelBg: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '商店弹窗底板；不配置则用深色底板' })
    shopDialogPanelBg: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '弹窗确定按钮（正常态）' })
    dialogBtnOkNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '弹窗确定按钮（按下态）' })
    dialogBtnOkPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '弹窗取消按钮（正常态）' })
    dialogBtnCancelNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '弹窗取消按钮（按下态）' })
    dialogBtnCancelPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '弹窗关闭按钮（正常态）' })
    dialogBtnCloseNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '弹窗关闭按钮（按下态）' })
    dialogBtnClosePressed: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '商店内购买按钮（正常态）' })
    shopBtnBuyNormal: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '商店内购买按钮（按下态）' })
    shopBtnBuyPressed: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: '商店内已拥有标签贴图' })
    shopBtnOwnedLabel: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '金币图标（首页与商店内展示）' })
    coinIcon: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '暗牌背面贴图；不配置则运行时从 button/cube/暗牌 加载' })
    hiddenTileSprite: SpriteFrame | null = null;

    @property({ type: AudioClip, tooltip: '暗牌翻转显露本来图案时播放；不配置则不播放' })
    sfxHiddenFlip: AudioClip | null = null;

    @property({ tooltip: '测试模式：开启后提示/刷新/消除道具不扣次数，可无限使用' })
    testMode = false;

    @property({
        tooltip:
            '测试模式起始关卡：>0 时从此关进入且不写入存档进度；=0 时按正常通关进度往下走，仅保留道具无限',
    })
    testLevel = 1;

    @property({ type: [SpriteFrame], tooltip: '商店陆地动物方块贴图列表（配置多少种展示多少种，每种 10 金币）' })
    shopLandAnimalSprites: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: '商店水生动物方块贴图列表' })
    shopAquaticAnimalSprites: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: '商店水果方块贴图列表' })
    shopFruitSprites: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: '商店零食方块贴图列表' })
    shopSnackSprites: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: '商店蔬菜方块贴图列表' })
    shopVegetableSprites: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: '商店面点方块贴图列表' })
    shopPastrySprites: SpriteFrame[] = [];

    private _home: HomeView | null = null;
    private _game: GameView | null = null;
    private _shopEnabled = false;
    private _shopGroups: ShopCatalogGroup[] = [];
    /** cube 分包加载得到的分组贴图（微信端编辑器引用可能为空） */
    private _cubeShopSprites: CubeShopSpriteGroups | null = null;
    private _cubeShopLoading = false;
    private _cubeShopWaiters: Array<() => void> = [];
    /** 已获得史诗方块（含贴图），可入选卡组 */
    private _epicDeckEntries: DeckEntry[] = [];
    /** 防止连点卡组/商店时在主线程重复构建弹窗 */
    private _homeDialogOpening = false;
    private _bgmSource: AudioSource | null = null;

    onLoad() {
        linkLog('GameApp.onLoad', 'begin', { node: nodePath(this.node), active: this.node.active });

        this._ensureAppUnderCanvas();

        const vs = getStableVisibleSize();
        const root = this.node;
        const ut = root.getComponent(UITransform) ?? root.addComponent(UITransform);
        ut.setContentSize(vs.width, vs.height);
        const w = root.getComponent(Widget) ?? root.addComponent(Widget);
        w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
        w.top = w.bottom = w.left = w.right = 0;
        w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        w.updateAlignment();

        const homeN = new Node('HomeRoot');
        homeN.setParent(root);
        const gameN = new Node('GameRoot');
        gameN.setParent(root);

        this._home = homeN.addComponent(HomeView);
        this._game = gameN.addComponent(GameView);
        gameN.active = false;

        this._applyHomeViewInit();

        this._setLayerRecursive(this.node, GameApp._defaultSceneLayerMask());

        linkLog('GameApp.onLoad', 'after children', {
            path: nodePath(this.node),
            layerMask: `0x${GameApp._defaultSceneLayerMask().toString(16)}`,
            homeView: !!this._home,
            gameView: !!this._game,
        });

        this.unschedule(this._syncCanvasOrthoAndAppSize);
        this._syncCanvasOrthoAndAppSize();
        this.scheduleOnce(this._syncCanvasOrthoAndAppSize, 0);
    }

    onEnable() {
        view.on('canvas-resize', this._syncCanvasOrthoAndAppSize, this);
    }

    onDisable() {
        view.off('canvas-resize', this._syncCanvasOrthoAndAppSize, this);
    }

    start() {
        linkLog('GameApp.start', 'enter', { path: nodePath(this.node) });
        this._syncCanvasOrthoAndAppSize();
        this.scheduleOnce(() => this._syncCanvasOrthoAndAppSize(), 0);
        ensureDefaultPropCounts();
        this._home?.setConfiguredBackground(this.homeBackground);
        if (this._game) {
            this._game.onBack = () => this._onGameBack();
            this._game.onLevelWin = (count) => this._onLevelWin(count);
            const toolBtns: GameToolButtonSprites = {
                backNormal: this.toolBtnBackNormal,
                backPressed: this.toolBtnBackPressed,
                hintNormal: this.toolBtnHintNormal,
                hintPressed: this.toolBtnHintPressed,
                refreshNormal: this.toolBtnRefreshNormal,
                refreshPressed: this.toolBtnRefreshPressed,
                eliminateNormal: this.toolBtnEliminateNormal,
                eliminatePressed: this.toolBtnEliminatePressed,
            };
            this._game.setToolButtonSprites(toolBtns);
            this._game.setGameBackground(this.gameBackground);
            this._game.setGameHeaderBackground(this.gameHeaderBackground);
            const sfx: GameSfxConfig = {
                connect: this.sfxConnect,
                select: this.sfxSelect,
                hint: this.sfxHint,
                refresh: this.sfxRefresh,
                eliminate: this.sfxEliminate,
                hiddenFlip: this.sfxHiddenFlip,
            };
            this._game.setGameSfx(sfx);
            this._game.setHiddenTileSprite(this.hiddenTileSprite);
            const noConnect: NoConnectDialogConfig = {
                message: this.noConnectDialogMessage,
                title: this.noConnectDialogTitle,
                autoDelay: Math.max(0.25, this.noConnectDialogAutoDelay),
                panelBg: this.noConnectDialogPanelBg,
            };
            this._game.setNoConnectDialog(noConnect);
            this._applyLevelClearDialog();
        }
        this._refreshHomeCoins();
        this._startBgm();
        // 微信小游戏：cube 为独立分包，需先 loadBundle 再构建商店/赠送
        this._withCubeShopReady(() => {
            if (!this.isValid) return;
            this._rebuildShopCatalog();
            this._syncGameModeFlags();
            // 仅缓存到 GameView；棋盘在首次进关 _buildUi 后由 whenUiReady 再原子注入
            this._applyDeckToGameView();
        });
        this.scheduleOnce(() => this._debugPipelineSnapshot('GameApp.start+0'), 0);
    }

    onDestroy() {
        this._bgmSource?.stop();
    }

    private _ensureBgmSource(): AudioSource | null {
        if (this._bgmSource?.isValid) return this._bgmSource;
        let a = this.node.getComponent(AudioSource);
        if (!a) {
            a = this.node.addComponent(AudioSource);
        }
        a.playOnAwake = false;
        a.loop = true;
        this._bgmSource = a;
        return a;
    }

    /** 启动循环背景音乐（挂载在 App 节点，首页与游戏页切换时不中断） */
    private _startBgm() {
        if (!this.bgm) return;
        const src = this._ensureBgmSource();
        if (!src) return;
        if (src.clip === this.bgm && src.playing) return;
        src.stop();
        src.clip = this.bgm;
        src.loop = true;
        const duration = this.bgm.getDuration();
        src.currentTime = duration > 10 ? 10 : 0;
        src.play();
    }

    /** 确保 cube 分包已加载；编辑器预览若无 bundle 也会走回调（用序列化贴图） */
    private _withCubeShopReady(done: () => void) {
        const afterEpic = () => {
            try {
                done();
            } catch (e) {
                linkWarn('GameApp._withCubeShopReady', 'callback failed', e);
            }
        };
        if (this._cubeShopSprites) {
            this._refreshEpicDeckEntries(afterEpic);
            return;
        }
        this._cubeShopWaiters.push(afterEpic);
        if (this._cubeShopLoading) return;
        this._cubeShopLoading = true;
        loadCubeShopSpriteGroups((groups) => {
            this._cubeShopSprites = groups;
            this._cubeShopLoading = false;
            const waiters = this._cubeShopWaiters.splice(0, this._cubeShopWaiters.length);
            this._refreshEpicDeckEntries(() => {
                for (const cb of waiters) {
                    try {
                        cb();
                    } catch (e) {
                        linkWarn('GameApp._withCubeShopReady', 'callback failed', e);
                    }
                }
            });
        });
    }

    /** 从本地史诗列表加载贴图缓存，供卡组勾选与开局使用 */
    private _refreshEpicDeckEntries(done: () => void) {
        const ids = loadEpicCubeIds();
        if (ids.length === 0) {
            this._epicDeckEntries = [];
            done();
            return;
        }
        loadCubeSpritesByNames(ids, (frames) => {
            if (!this.isValid) {
                done();
                return;
            }
            const out: DeckEntry[] = [];
            for (let i = 0; i < ids.length; i++) {
                const sf = frames[i];
                if (!sf) continue;
                out.push({ shopKey: makeEpicShopKey(ids[i]), sprite: sf });
            }
            this._epicDeckEntries = out;
            done();
        });
    }

    private _mergeDeckEntriesWithEpic(base: DeckEntry[]): DeckEntry[] {
        const out = base.slice();
        const seen: Record<string, number> = Object.create(null);
        for (let i = 0; i < out.length; i++) seen[String(out[i].shopKey)] = 1;
        for (let i = 0; i < this._epicDeckEntries.length; i++) {
            const e = this._epicDeckEntries[i];
            const k = String(e.shopKey);
            if (seen[k]) continue;
            seen[k] = 1;
            out.push(e);
        }
        return out;
    }

    private _rebuildShopCatalog() {
        try {
            const bundle = this._cubeShopSprites;
            const catalog = buildShopCatalog({
                tileFaces: this.tileFaceSprites ?? [],
                landAnimals: pickRicherSpriteList(this.shopLandAnimalSprites, bundle?.landAnimals),
                aquaticAnimals: pickRicherSpriteList(this.shopAquaticAnimalSprites, bundle?.aquaticAnimals),
                fruits: pickRicherSpriteList(this.shopFruitSprites, bundle?.fruits),
                snacks: pickRicherSpriteList(this.shopSnackSprites, bundle?.snacks),
                vegetables: pickRicherSpriteList(this.shopVegetableSprites, bundle?.vegetables),
                pastries: pickRicherSpriteList(this.shopPastrySprites, bundle?.pastries),
            });
            this._shopGroups = catalog.groups;
            this._shopEnabled = hasShopCatalog(this._shopGroups);
            // 新玩家道具赠送与商店是否启用无关
            ensureDefaultPropCounts();
            if (!this._shopEnabled) return;

            const giftEntries = getDefaultOwnedEntries(this._shopGroups);
            const giftKeys = giftEntries.map((e) => e.shopKey);
            const ownedKeys = ensureDefaultShopOwnership(giftKeys);
            const deckEntries = this._mergeDeckEntriesWithEpic(collectDeckEntriesForUi(this._shopGroups));
            ensureDefaultDeckSelection(
                this._shopGroups,
                deckEntries.map((e) => e.shopKey),
            );
            linkLog('GameApp._rebuildShopCatalog', {
                groups: this._shopGroups.map((g) => `${g.groupKey}:${g.items.length}`),
                giftEntries: giftEntries.length,
                giftKeys: giftKeys.length,
                ownedKeys: ownedKeys.length,
                deckEntries: deckEntries.length,
                epicEntries: this._epicDeckEntries.length,
                sampleGift: giftKeys.slice(0, 3),
                sampleEntryKey: deckEntries.slice(0, 3).map((e) => e.shopKey),
                fromCubeBundle: !!bundle,
            });
            if (deckEntries.length < MIN_DECK_TYPE_COUNT) {
                linkWarn('GameApp._rebuildShopCatalog', '可选方块不足 30 种', {
                    giftEntries: giftEntries.length,
                    deckEntries: deckEntries.length,
                });
            }
        } catch (e) {
            linkWarn('GameApp._rebuildShopCatalog', '商店目录构建失败', e);
            this._shopEnabled = hasShopCatalog(this._shopGroups);
        }
    }

    private _applyLevelClearDialog() {
        if (!this._game) return;
        const cfg: LevelClearDialogConfig = {
            panelBg: this.levelClearPanelBg,
            coinIcon: this.coinIcon,
            animFrames: this.levelClearAnimFrames ?? [],
            animFps: Math.max(1, this.levelClearAnimFps),
            buttons: {
                homeNormal: this.levelClearBtnHomeNormal,
                homePressed: this.levelClearBtnHomePressed,
                nextNormal: this.levelClearBtnNextNormal,
                nextPressed: this.levelClearBtnNextPressed,
            },
        };
        this._game.setLevelClearDialog(cfg);
        this._game.setLevelClearPassSfx(this.sfxLevelClear);
        this._game.setTarotFlipSfx(this.sfxTarotFlip);
    }

    private _getDialogActionButtons(): DialogActionButtonSprites {
        return {
            okNormal: this.dialogBtnOkNormal,
            okPressed: this.dialogBtnOkPressed,
            cancelNormal: this.dialogBtnCancelNormal,
            cancelPressed: this.dialogBtnCancelPressed,
            closeNormal: this.dialogBtnCloseNormal,
            closePressed: this.dialogBtnClosePressed,
        };
    }

    /**
     * 从商店赠送/已购/史诗条目挑出开局卡组（≥30），直接带 sprite，避免反查目录失败只剩 1 张贴图。
     */
    private _pickShopDeckEntries(): Array<{ shopKey: string; sprite: SpriteFrame }> | null {
        if (!this._shopEnabled) return null;
        const deckEntries = this._mergeDeckEntriesWithEpic(collectDeckEntriesForUi(this._shopGroups));
        if (deckEntries.length < MIN_DECK_TYPE_COUNT) return null;
        const ownedKeys = deckEntries.map((e) => e.shopKey);
        ensureDefaultDeckSelection(this._shopGroups, ownedKeys);
        let keys = loadDeckShopKeysRaw(this._shopGroups, ownedKeys);
        if (keys.length < MIN_DECK_TYPE_COUNT) {
            keys = ownedKeys.slice(0, MIN_DECK_TYPE_COUNT);
            saveDeckShopKeys(keys);
        }
        const byKey: Record<string, (typeof deckEntries)[0]> = Object.create(null);
        for (let i = 0; i < deckEntries.length; i++) {
            byKey[String(deckEntries[i].shopKey)] = deckEntries[i];
        }
        const picked: typeof deckEntries = [];
        for (let i = 0; i < keys.length && picked.length < MAX_DECK_TYPE_COUNT; i++) {
            const e = byKey[String(keys[i])];
            if (e?.sprite) picked.push(e);
        }
        if (picked.length < MIN_DECK_TYPE_COUNT) {
            picked.length = 0;
            for (let i = 0; i < deckEntries.length && picked.length < MIN_DECK_TYPE_COUNT; i++) {
                if (deckEntries[i].sprite) picked.push(deckEntries[i]);
            }
            saveDeckShopKeys(picked.map((e) => e.shopKey));
        }
        return picked.length >= MIN_DECK_TYPE_COUNT ? picked : null;
    }

    /** 把当前卡组贴图 + typeId 注入 GameView（商店模式优先用 _pickShopDeckEntries） */
    private _applyDeckToGameView(): boolean {
        const picked = this._pickShopDeckEntries();
        if (picked) {
            const ids = deckEntriesToTypeIds(picked);
            if (ids.length < MIN_DECK_TYPE_COUNT) return false;
            const faces = buildTileFacesFromDeckEntries(picked);
            this._game?.applyTileFacesAndDeck(faces, ids);
            return true;
        }
        const faces = this.tileFaceSprites ?? [];
        const configured = getConfiguredTypeIds(faces);
        if (configured.length >= MIN_DECK_TYPE_COUNT) {
            let ids = loadDeckTypeIdsForGame(faces, false);
            if (!ids || ids.length < MIN_DECK_TYPE_COUNT) {
                ids = configured.slice(0, MIN_DECK_TYPE_COUNT);
            }
            this._game?.applyTileFacesAndDeck(faces, ids);
            return true;
        }
        this._game?.applyTileFacesAndDeck(faces.length > 0 ? faces : null, null);
        return configured.length === 0 && !this._shopEnabled;
    }

    private _getTileFacesForGame(): Array<SpriteFrame | null> {
        const picked = this._pickShopDeckEntries();
        if (picked) return buildTileFacesFromDeckEntries(picked);
        return this.tileFaceSprites ?? [];
    }

    private _refreshHomeCoins() {
        this._home?.setCoinDisplay(loadCoins(), this.coinIcon);
    }

    /** 退出游戏：静默结算本关未发放的金币（无弹窗） */
    private _syncGameModeFlags() {
        this._game?.setShopPropsEnabled(this._shopEnabled);
        this._game?.setTestMode(this.testMode);
    }

    private _onGameBack() {
        this._game?.closeLevelClearOverlay();
        const pending = this._game?.takePendingConnectCoins() ?? 0;
        trackLevelEnd('abort', {
            connectCount: pending,
            coinsEarned: pending,
            reason: 'back_home',
        });
        if (pending > 0) {
            addCoins(pending);
        }
        this._enterHome();
    }

    /** 测试模式且指定了起始关（>0）：跳关调试；=0 则走正常进度 */
    private _hasTestLevelOverride(): boolean {
        return this.testMode && Math.floor(this.testLevel) > 0;
    }

    private _resolveStartLevel(): number {
        if (this._hasTestLevelOverride()) {
            return Math.max(1, Math.floor(this.testLevel));
        }
        return loadCurrentLevel();
    }

    /** 关卡通关：发放金币并打开结算页 */
    private _onLevelWin(connectCount: number) {
        const level = this._game?.getLevel() ?? 1;
        const nextLevel = level + 1;
        trackLevelEnd('win', {
            connectCount,
            coinsEarned: connectCount,
        });
        // 指定测试关时不改存档；TestLevel=0 时与正常模式一样推进进度
        if (!this._hasTestLevelOverride()) {
            saveCurrentLevel(nextLevel);
        }
        if (connectCount > 0) {
            addCoins(connectCount);
            this._refreshHomeCoins();
        }
        this._applyLevelClearDialog();
        this._game?.openLevelClearOverlay(
            level,
            connectCount,
            () => this._enterHome(),
            () => this._game?.beginOrRestartLevel(nextLevel),
        );
    }

    /** 首帧后打一次：摄像机、App、开始按钮、layer 与 visibility */
    private _debugPipelineSnapshot(where: string) {
        const canvas = this.node.parent;
        const cam = canvas?.getChildByName('UICamera')?.getComponent(Camera) ?? null;
        linkLog('GameApp.debug', where, {
            canvasPath: nodePath(canvas),
            appPath: nodePath(this.node),
            hasUiCam: !!cam,
        });
        if (cam) {
            linkLog('GameApp.debug.UICamera', {
                orthoHeight: cam.orthoHeight,
                clearFlags: cam.clearFlags,
                clearColor: `${cam.clearColor?.r},${cam.clearColor?.g},${cam.clearColor?.b}`,
                visibilityHex: `0x${cam.visibility.toString(16)}`,
            });
        }
        linkDumpNode('GameApp.debug.App', this.node);
        const hr = this._home?.node;
        linkDumpNode('GameApp.debug.HomeRoot', hr ?? null);
        const st = hr?.getChildByName('StartGame') ?? null;
        linkDumpNode('GameApp.debug.StartGame', st);
        if (st && cam) {
            linkLayerVsCamera('GameApp.debug.Start-vs-UICamera', st, cam);
        }
    }

    private _applyHomeViewInit() {
        if (!this._home) return;
        const sprites: HomeMainButtonSprites = {
            startNormal: this.homeBtnStartNormal,
            startPressed: this.homeBtnStartPressed,
            deckNormal: this.homeBtnDeckNormal,
            deckPressed: this.homeBtnDeckPressed,
            shopNormal: this.homeBtnShopNormal,
            shopPressed: this.homeBtnShopPressed,
        };
        this._home.init({
            sprites,
            onStart: () => this._onHomeStartGame(),
            onDeck: () => this._openDeckDialog(),
            onShop: () => this._openShopDialog(),
        });
    }

    private _syncDeckToGameView() {
        this._applyDeckToGameView();
    }

    private _onHomeStartGame() {
        this._withCubeShopReady(() => {
            if (!this.isValid) return;
            this._rebuildShopCatalog();

            const picked = this._pickShopDeckEntries();
            if (picked) {
                linkLog('GameApp._onHomeStartGame', {
                    mode: 'shop-deck',
                    picked: picked.length,
                });
                this._enterGame();
                return;
            }

            const faces = this.tileFaceSprites ?? [];
            const configured = getConfiguredTypeIds(faces);
            if (configured.length >= MIN_DECK_TYPE_COUNT) {
                this._enterGame();
                return;
            }
            if (configured.length > 0) {
                this._home?.showToast(
                    `请至少在 GameApp 中配置 ${MIN_DECK_TYPE_COUNT} 种格子贴图；当前仅 ${configured.length} 种。`,
                );
                return;
            }
            if (this._shopEnabled) {
                this._home?.showToast(
                    `请先在「商店」获得至少 ${MIN_DECK_TYPE_COUNT} 种方块后再开始。`,
                );
                return;
            }
            this._enterGame();
        });
    }

    private _openDeckDialog() {
        const hr = this._home?.node;
        if (!hr || this._homeDialogOpening) return;
        if (hr.getChildByName('DeckSelectModal')) return;
        this._homeDialogOpening = true;
        this._withCubeShopReady(() => {
            this._homeDialogOpening = false;
            if (!hr.isValid || hr.getChildByName('DeckSelectModal')) return;
            this._rebuildShopCatalog();
            const deckEntries = collectDeckEntriesForUi(this._shopGroups);
            const ownedKeys = this._mergeDeckEntriesWithEpic(deckEntries).map((e) => e.shopKey);
            ensureDefaultDeckSelection(this._shopGroups, ownedKeys);
            const epicItems: EpicDeckItem[] = this._epicDeckEntries.map((e) => ({
                id: e.shopKey.startsWith('epic:') ? e.shopKey.slice(5) : e.shopKey,
                sprite: e.sprite,
            }));
            linkLog('GameApp._openDeckDialog', {
                shopEnabled: this._shopEnabled,
                deckEntries: deckEntries.length,
                epicItems: epicItems.length,
                sample: deckEntries.slice(0, 3).map((e) => e.shopKey),
            });
            DeckSelectDialog.open(hr, {
                tileFaces: this._getTileFacesForGame(),
                panelBg: this.deckDialogPanelBg,
                actionButtons: this._getDialogActionButtons(),
                shopEnabled: this._shopEnabled,
                shopGroups: this._shopGroups.length > 0 ? this._shopGroups : undefined,
                deckEntries: this._shopEnabled ? deckEntries : undefined,
                epicItems,
                onSaved: (ids) => {
                    if (this._shopEnabled) {
                        this._game?.applyTileFacesAndDeck(this._getTileFacesForGame(), ids);
                    } else {
                        this._game?.setDeckTypeIds(ids);
                    }
                },
            });
        });
    }

    private _openShopDialog() {
        const hr = this._home?.node;
        if (!hr || this._homeDialogOpening) return;
        if (hr.getChildByName('ShopModal')) return;
        this._homeDialogOpening = true;
        this._withCubeShopReady(() => {
            this._homeDialogOpening = false;
            if (!hr.isValid || hr.getChildByName('ShopModal')) return;
            this._rebuildShopCatalog();
            if (!this._shopEnabled) {
                this._home?.showToast('请先在 GameApp 的商店分组中配置方块贴图。');
                return;
            }
            // 再补一次赠送，保证「已拥有」徽章与卡组一致
            ensureDefaultShopOwnership(getDefaultOwnedShopKeys(this._shopGroups));

            ShopDialog.open(hr, {
                groups: this._shopGroups,
                panelBg: this.shopDialogPanelBg,
                actionButtons: this._getDialogActionButtons(),
                coinIcon: this.coinIcon,
                propIcons: {
                    hint: this.toolBtnHintNormal,
                    refresh: this.toolBtnRefreshNormal,
                    eliminate: this.toolBtnEliminateNormal,
                },
                shopButtons: {
                    buyNormal: this.shopBtnBuyNormal,
                    buyPressed: this.shopBtnBuyPressed,
                    owned: this.shopBtnOwnedLabel,
                },
                onCoinsChanged: () => this._refreshHomeCoins(),
            });
        });
    }

    private _enterGame() {
        linkLog('GameApp._enterGame', '点击开始 → 显示游戏页');
        if (this._home) this._home.node.active = false;
        if (this._game) {
            this._game.onBack = () => this._onGameBack();
            this._game.onLevelWin = (count) => this._onLevelWin(count);
            this._syncGameModeFlags();
            this._applyLevelClearDialog();
            this._game.setHiddenTileSprite(this.hiddenTileSprite);
            // 先缓存卡组，再激活（触发异步 _buildUi）；棋盘就绪后原子注入并开局
            this._applyDeckToGameView();
            this._game.node.active = true;
            const startLevel = this._resolveStartLevel();
            this._game.whenUiReady(() => {
                if (!this.isValid || !this._game) return;
                const ok = this._applyDeckToGameView();
                if (!ok && this._shopEnabled) {
                    linkWarn('GameApp._enterGame', '商店卡组注入失败，仍进入游戏（棋盘将回退可用贴图）');
                }
                this._game.beginOrRestartLevel(startLevel);
                this._game.relayout();
            });
        }
    }

    private _enterHome() {
        linkLog('GameApp._enterHome', '返回首页');
        if (this._game) this._game.node.active = false;
        if (this._home) this._home.node.active = true;
        this._refreshHomeCoins();
    }

    /** 2D UI 必须挂在带 Canvas 的节点下，否则只会看到主摄像机清屏色 */
    private _ensureAppUnderCanvas() {
        const scene = director.getScene();
        if (!scene) {
            linkLog('GameApp', '_ensureAppUnderCanvas: director.getScene() 为空');
            return;
        }

        let canvas = scene.getChildByName('Canvas');
        const existed = !!canvas;
        if (!canvas) {
            canvas = new Node('Canvas');
            scene.addChild(canvas);

            const canvasComp = canvas.addComponent(Canvas);

            const ut = canvas.addComponent(UITransform);
            const vs = getStableVisibleSize();
            ut.setContentSize(vs.width, vs.height);
            const wg = canvas.addComponent(Widget);
            wg.isAlignTop = wg.isAlignBottom = wg.isAlignLeft = wg.isAlignRight = true;
            wg.top = wg.bottom = wg.left = wg.right = 0;
            wg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
            wg.updateAlignment();
        }

        this._configureCanvasUiCamera(canvas);

        if (this.node.parent !== canvas) {
            this.node.setParent(canvas, true);
        }
        linkLog('GameApp', '_ensureAppUnderCanvas', {
            canvasExistedInScene: existed,
            appPath: nodePath(this.node),
            canvasChildCount: canvas.children.length,
        });
        const uiCamNode = canvas.getChildByName('UICamera');
        if (uiCamNode) {
            uiCamNode.setSiblingIndex(0);
        }
        canvas.layer = GameApp._defaultSceneLayerMask();

        this.unschedule(this._syncCanvasOrthoAndAppSize);
        this._syncCanvasOrthoAndAppSize();
        this.scheduleOnce(this._syncCanvasOrthoAndAppSize, 0);
    }

    /**
     * 屏幕空间 - 覆盖 + 关掉 Canvas 下所有摄像机时，若场景里没有其它可用摄像机，预览会卡在加载/无首帧。
     * 使用专用正交 UICamera，并禁用编辑器自带的 Canvas/Camera；UICamera 用 SOLID_COLOR 清屏（否则只剩 DEPTH_ONLY 且无其它相机时缓冲区未定义）。
     */
    private _configureCanvasUiCamera(canvas: Node) {
        const canvasComp = canvas.getComponent(Canvas);
        if (!canvasComp) return;

        let camNode = canvas.getChildByName('UICamera');
        if (!camNode) {
            camNode = new Node('UICamera');
            camNode.setParent(canvas, false);
            camNode.setPosition(0, 0, 900);
        }

        let cam = camNode.getComponent(Camera);
        if (!cam) {
            cam = camNode.addComponent(Camera);
        }

        const vs = getStableVisibleSize();
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = vs.height / 2;
        cam.near = 0.1;
        cam.far = 2000;
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        // 与「无全屏 Bg」的首页一致：清屏即白底，不依赖全屏 Sprite
        cam.clearColor = new Color(255, 255, 255, 255);
        cam.visibility = GameApp._defaultSceneLayerMask();
        cam.priority = 10;

        (canvasComp as CanvasComp).cameraComponent = cam;
        const RM = (Canvas as unknown as { RenderMode?: { SCREEN_SPACE_CAMERA: number } }).RenderMode;
        canvasComp.renderMode = RM?.SCREEN_SPACE_CAMERA ?? 1;
        canvasComp.alignCanvasWithScreen = true;

        camNode.layer = canvas.layer;

        for (const child of canvas.children) {
            if (child === camNode) continue;
            const other = child.getComponent(Camera);
            if (other) {
                other.enabled = false;
                linkLog('GameApp', '_configureCanvasUiCamera: 已禁用多余摄像机', { node: child.name });
            }
        }

        linkLog('GameApp', '_configureCanvasUiCamera', {
            renderMode: canvasComp.renderMode,
            orthoHeight: cam.orthoHeight,
            visibleSize: { w: vs.width, h: vs.height },
            camVisibilityHex: `0x${GameApp._defaultSceneLayerMask().toString(16)}`,
            camPriority: cam.priority,
        });
    }

    /** 正交高度与 Canvas UITransform 对齐，并拉齐 App 尺寸，避免 UI 只在「逻辑尺寸」里画在屏外 */
    private _syncCanvasOrthoAndAppSize = () => {
        const canvas = this.node.parent;
        if (!canvas) {
            linkLog('GameApp._sync', 'App.parent 不是 Canvas，跳过', { path: nodePath(this.node) });
            return;
        }
        const stable = getStableVisibleSize();
        const cut = canvas.getComponent(UITransform);
        const cam = canvas.getChildByName('UICamera')?.getComponent(Camera);
        const cwg = canvas.getComponent(Widget);

        // 首帧 Canvas UITransform 常被压成极小（如 100×100），若用 cut.height/2 设 ortho，底栏在 720 坐标系下会整段在视锥外 → 只见白底
        if (cut) {
            const tinyW = cut.width < stable.width * 0.75;
            const tinyH = cut.height < stable.height * 0.75;
            if (tinyW || tinyH) {
                linkWarn('GameApp._sync', 'Canvas UITransform 过小，已用 getStableVisibleSize 拉回', {
                    before: { w: cut.width, h: cut.height },
                    stable: { w: stable.width, h: stable.height },
                });
                cut.setContentSize(stable.width, stable.height);
                cwg?.updateAlignment();
            }
        }

        const layoutSize = new Size(
            Math.max(stable.width, cut?.width ?? 0),
            Math.max(stable.height, cut?.height ?? 0),
        );
        if (cam && layoutSize.height > 1) {
            cam.orthoHeight = layoutSize.height / 2;
        }

        const aut = this.node.getComponent(UITransform);
        if (aut) aut.setContentSize(layoutSize.width, layoutSize.height);
        this.node.getComponent(Widget)?.updateAlignment();
        for (const c of this.node.children) {
            c.getComponent(Widget)?.updateAlignment();
        }
        this._home?.relayout();
        this._game?.relayout();

        linkLog('GameApp._sync', 'Canvas/App/UICamera', {
            canvas: canvas.name,
            canvasUt: cut ? { w: cut.width, h: cut.height } : null,
            stable: { w: stable.width, h: stable.height },
            uiCamOrtho: cam?.orthoHeight,
            appUt: aut ? { w: aut.width, h: aut.height } : null,
            layoutUsed: { w: layoutSize.width, h: layoutSize.height },
        });
    };

    /** 与编辑器默认节点、Main Camera 可见层一致（DEFAULT） */
    private static _defaultSceneLayerMask(): number {
        const L = Layers as typeof Layers & { BitMask?: { DEFAULT: number } };
        return L.BitMask?.DEFAULT ?? (1 << Layers.Enum.DEFAULT);
    }

    private _setLayerRecursive(n: Node, layer: number) {
        n.layer = layer;
        for (const c of n.children) {
            this._setLayerRecursive(c, layer);
        }
    }
}
