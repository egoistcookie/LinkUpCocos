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
import {
    GameView,
    type GameSfxConfig,
    type GameToolButtonSprites,
    type NoConnectDialogConfig,
} from './game/GameView';
import type { LevelClearDialogConfig } from './game/LevelClearOverlay';
import { HomeView, type HomeMainButtonSprites } from './game/HomeView';
import { DeckSelectDialog } from './game/DeckSelectDialog';
import { ShopDialog } from './game/ShopDialog';
import { TILE_SPRITE_SLOTS } from './game/LinkUpBoard';
import {
    getConfiguredTypeIds,
    getPurchasedDeckEntries,
    loadDeckShopKeysRaw,
    loadDeckTypeIdsForGame,
    MAX_DECK_TYPE_COUNT,
    MIN_DECK_TYPE_COUNT,
} from './util/DeckSelectionStorage';
import {
    addCoins,
    ensureDefaultShopOwnership,
    loadCoins,
    loadCurrentLevel,
    saveCurrentLevel,
} from './util/PlayerResourceStorage';
import {
    buildShopCatalog,
    buildTileFacesFromDeckKeys,
    getDefaultOwnedShopKeys,
    hasShopCatalog,
    type ShopCatalogGroup,
} from './util/ShopCatalog';
import { type DialogActionButtonSprites } from './util/DialogActionButtons';
import { linkDumpNode, linkLayerVsCamera, linkLog, linkWarn, nodePath } from './util/LinkUpDebug';
import { getStableVisibleSize } from './util/ViewSize';

type CanvasComp = Canvas & { cameraComponent: Camera | null };

const { ccclass, property } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
    /** 可选：序列帧全屏背景；不赋值则首页无 Bg 节点，白底仅由 UICamera 清屏色提供（避免全屏 Sprite 挡按钮） */
    @property(SpriteFrame)
    homeBackground: SpriteFrame | null = null;

    /** 可选：游戏主体页全屏背景；不赋值则与现有一致（顶栏/棋盘区/底栏各自底色，其余为摄像机清屏色） */
    @property(SpriteFrame)
    gameBackground: SpriteFrame | null = null;

    /** 可选：游戏页顶栏页眉背景；不赋值则顶栏无底色条，仅居中显示关卡数 */
    @property(SpriteFrame)
    gameHeaderBackground: SpriteFrame | null = null;

    /**
     * 棋盘格子贴图：第 i 项对应「i+1 号」类型。
     * 若 32 项都配置了贴图：与原先一致，无贴图槽位不会用到。
     * 若未满 32 种：盘面只生成已配置的类型、不显示数字；未配置的槽位不参与发牌。
     */
    @property({
        type: [SpriteFrame],
        tooltip: `共 ${TILE_SPRITE_SLOTS} 项：索引 0→1号 …；卡组模式由商店配置映射到槽位`,
    })
    tileFaceSprites: Array<SpriteFrame | null> = [];

    /** 游戏页：返回（普通 / 按下） */
    @property(SpriteFrame)
    toolBtnBackNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    toolBtnBackPressed: SpriteFrame | null = null;
    /** 提示 */
    @property(SpriteFrame)
    toolBtnHintNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    toolBtnHintPressed: SpriteFrame | null = null;
    /** 刷新 */
    @property(SpriteFrame)
    toolBtnRefreshNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    toolBtnRefreshPressed: SpriteFrame | null = null;
    /** 消除 */
    @property(SpriteFrame)
    toolBtnEliminateNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    toolBtnEliminatePressed: SpriteFrame | null = null;

    /** 连线成功消除一对时播放（可选） */
    @property(AudioClip)
    sfxConnect: AudioClip | null = null;
    /** 选中棋盘方块时播放（可选） */
    @property(AudioClip)
    sfxSelect: AudioClip | null = null;
    /** 点击「提示」 */
    @property(AudioClip)
    sfxHint: AudioClip | null = null;
    /** 点击「刷新」 */
    @property(AudioClip)
    sfxRefresh: AudioClip | null = null;
    /** 点击「消除」 */
    @property(AudioClip)
    sfxEliminate: AudioClip | null = null;
    /** 通关结算弹窗出现时播放（可选） */
    @property(AudioClip)
    sfxLevelClear: AudioClip | null = null;
    /** 背景音乐；配置后在游戏启动后循环播放 */
    @property({ type: AudioClip, tooltip: '游戏启动后循环播放；不配置则不播放' })
    bgm: AudioClip | null = null;

    /** 通关结算弹窗底板图；不配置则用深色纯色块 */
    @property(SpriteFrame)
    levelClearPanelBg: SpriteFrame | null = null;
    /**
     * 通关庆祝动画帧：在结算弹窗下层、画面上半区循环播放；
     * 点击「返回首页」或「下一关」后停止。
     */
    @property({ type: [SpriteFrame], tooltip: '通关结算上半屏循环动画帧（按顺序播放）' })
    levelClearAnimFrames: SpriteFrame[] = [];
    @property({ tooltip: '庆祝动画帧率（帧/秒）' })
    levelClearAnimFps = 12;
    /** 通关结算：返回首页（普通 / 按下），不配置则用纯色底、无文字 */
    @property(SpriteFrame)
    levelClearBtnHomeNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    levelClearBtnHomePressed: SpriteFrame | null = null;
    /** 通关结算：下一关（普通 / 按下），不配置则用纯色底、无文字 */
    @property(SpriteFrame)
    levelClearBtnNextNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    levelClearBtnNextPressed: SpriteFrame | null = null;

    /** 场上无可连对时弹窗主文案 */
    @property
    noConnectDialogMessage = '场上没有可连线方块，自动刷新';
    /** 弹窗副标题（可留空） */
    @property
    noConnectDialogTitle = '';
    /** 弹窗展示多少秒后自动执行洗牌（秒） */
    @property
    noConnectDialogAutoDelay = 1.2;
    /** 弹窗底板图；不配置则用深色纯色块 */
    @property(SpriteFrame)
    noConnectDialogPanelBg: SpriteFrame | null = null;

    /** 首页：开始游戏（普通 / 按下），不配置则用纯色底 + 文字 */
    @property(SpriteFrame)
    homeBtnStartNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    homeBtnStartPressed: SpriteFrame | null = null;
    /** 配置卡组 */
    @property(SpriteFrame)
    homeBtnDeckNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    homeBtnDeckPressed: SpriteFrame | null = null;
    /** 商店 */
    @property(SpriteFrame)
    homeBtnShopNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    homeBtnShopPressed: SpriteFrame | null = null;
    /** 配置卡组弹窗底板；不配置则用与项目样式一致的深色底板 */
    @property(SpriteFrame)
    deckDialogPanelBg: SpriteFrame | null = null;
    /** 商店弹窗底板；不配置则用深色底板 */
    @property(SpriteFrame)
    shopDialogPanelBg: SpriteFrame | null = null;

    /** 弹窗「确定」按钮（普通 / 按下） */
    @property(SpriteFrame)
    dialogBtnOkNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    dialogBtnOkPressed: SpriteFrame | null = null;
    /** 弹窗「取消」按钮 */
    @property(SpriteFrame)
    dialogBtnCancelNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    dialogBtnCancelPressed: SpriteFrame | null = null;
    /** 弹窗「关闭」按钮（商店底栏等） */
    @property(SpriteFrame)
    dialogBtnCloseNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    dialogBtnClosePressed: SpriteFrame | null = null;

    /** 商店内「购买」按钮（普通 / 按下） */
    @property(SpriteFrame)
    shopBtnBuyNormal: SpriteFrame | null = null;
    @property(SpriteFrame)
    shopBtnBuyPressed: SpriteFrame | null = null;
    /** 商店内「已拥有」标签贴图 */
    @property(SpriteFrame)
    shopBtnOwnedLabel: SpriteFrame | null = null;

    /** 金币图标（首页与商店内展示） */
    @property(SpriteFrame)
    coinIcon: SpriteFrame | null = null;

    /** 测试模式：开启后游戏内提示/刷新/消除道具不消耗库存，可无限使用 */
    @property({
        tooltip: '开启后游戏内提示、刷新、消除道具不扣次数，可无限使用',
    })
    testMode = false;

    /** 商店：陆地动物方块（配置多少种展示多少种，每种 10 金币） */
    @property({ type: [SpriteFrame], tooltip: '陆地动物方块贴图列表' })
    shopLandAnimalSprites: SpriteFrame[] = [];

    /** 商店：水生动物方块 */
    @property({ type: [SpriteFrame], tooltip: '水生动物方块贴图列表' })
    shopAquaticAnimalSprites: SpriteFrame[] = [];

    /** 商店：水果方块 */
    @property({ type: [SpriteFrame], tooltip: '水果方块贴图列表' })
    shopFruitSprites: SpriteFrame[] = [];

    /** 商店：零食方块 */
    @property({ type: [SpriteFrame], tooltip: '零食方块贴图列表' })
    shopSnackSprites: SpriteFrame[] = [];

    /** 商店：蔬菜方块 */
    @property({ type: [SpriteFrame], tooltip: '蔬菜方块贴图列表' })
    shopVegetableSprites: SpriteFrame[] = [];

    /** 商店：面点方块 */
    @property({ type: [SpriteFrame], tooltip: '面点方块贴图列表' })
    shopPastrySprites: SpriteFrame[] = [];

    private _home: HomeView | null = null;
    private _game: GameView | null = null;
    private _shopEnabled = false;
    private _shopGroups: ShopCatalogGroup[] = [];
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
        this._rebuildShopCatalog();

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
        this._home?.setConfiguredBackground(this.homeBackground);
        if (this._game) {
            this._game.onBack = () => this._onGameBack();
            this._game.onLevelWin = (count) => this._onLevelWin(count);
            this._syncGameModeFlags();
            this._game.setTileFaceSprites(this._getTileFacesForGame());
            this._syncDeckToGameView();
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
            };
            this._game.setGameSfx(sfx);
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

    private _rebuildShopCatalog() {
        const catalog = buildShopCatalog({
            tileFaces: this.tileFaceSprites ?? [],
            landAnimals: this.shopLandAnimalSprites ?? [],
            aquaticAnimals: this.shopAquaticAnimalSprites ?? [],
            fruits: this.shopFruitSprites ?? [],
            snacks: this.shopSnackSprites ?? [],
            vegetables: this.shopVegetableSprites ?? [],
            pastries: this.shopPastrySprites ?? [],
        });
        this._shopGroups = catalog.groups;
        this._shopEnabled = hasShopCatalog(this._shopGroups);
        if (this._shopEnabled) {
            ensureDefaultShopOwnership(getDefaultOwnedShopKeys(this._shopGroups));
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

    private _getTileFacesForGame(): Array<SpriteFrame | null> {
        if (this._shopEnabled) {
            const keys = loadDeckShopKeysRaw(this._shopGroups);
            if (keys.length >= MIN_DECK_TYPE_COUNT) {
                return buildTileFacesFromDeckKeys(this._shopGroups, keys);
            }
        }
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
        if (pending > 0) {
            addCoins(pending);
        }
        this._enterHome();
    }

    /** 关卡通关：发放金币并打开结算页 */
    private _onLevelWin(connectCount: number) {
        const level = this._game?.getLevel() ?? 1;
        const nextLevel = level + 1;
        saveCurrentLevel(nextLevel);
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
        const faces = this._getTileFacesForGame();
        const ids = loadDeckTypeIdsForGame(faces, this._shopEnabled, this._shopGroups);
        if (ids && ids.length >= MIN_DECK_TYPE_COUNT) {
            this._game?.setDeckTypeIds(ids);
            if (this._shopEnabled) this._game?.setTileFaceSprites(faces);
        } else {
            this._game?.setDeckTypeIds(null);
        }
    }

    private _onHomeStartGame() {
        const faces = this._getTileFacesForGame();
        if (this._shopEnabled) {
            const owned = getPurchasedDeckEntries(this._shopGroups).length;
            if (owned < MIN_DECK_TYPE_COUNT) {
                this._home?.showToast(
                    `请先在「商店」获得至少 ${MIN_DECK_TYPE_COUNT} 种方块，并在「配置卡组」中勾选 ${MIN_DECK_TYPE_COUNT}～${MAX_DECK_TYPE_COUNT} 种后再开始。`,
                );
                return;
            }
            const ids = loadDeckTypeIdsForGame(faces, true, this._shopGroups);
            if (!ids) {
                this._home?.showToast(
                    `请先在「配置卡组」中选择 ${MIN_DECK_TYPE_COUNT}～${MAX_DECK_TYPE_COUNT} 种方块后再开始游戏。`,
                );
                return;
            }
            this._game?.setTileFaceSprites(buildTileFacesFromDeckKeys(this._shopGroups, loadDeckShopKeysRaw(this._shopGroups)));
            this._game?.setDeckTypeIds(ids);
        } else {
            const configured = getConfiguredTypeIds(faces);
            if (configured.length >= MIN_DECK_TYPE_COUNT) {
                const ids = loadDeckTypeIdsForGame(faces, false);
                if (!ids) {
                    this._home?.showToast(
                        `请先在「配置卡组」中选择 ${MIN_DECK_TYPE_COUNT}～${MAX_DECK_TYPE_COUNT} 种方块后再开始游戏。`,
                    );
                    return;
                }
                this._game?.setDeckTypeIds(ids);
            } else if (configured.length > 0) {
                this._home?.showToast(
                    `请至少在 GameApp 中配置 ${MIN_DECK_TYPE_COUNT} 种格子贴图；当前仅 ${configured.length} 种。`,
                );
                return;
            } else {
                this._game?.setDeckTypeIds(null);
            }
        }
        this._enterGame();
    }

    private _openDeckDialog() {
        const hr = this._home?.node;
        if (!hr || this._homeDialogOpening) return;
        if (hr.getChildByName('DeckSelectModal')) return;
        this._homeDialogOpening = true;
        this.scheduleOnce(() => {
            this._homeDialogOpening = false;
            if (!hr.isValid || hr.getChildByName('DeckSelectModal')) return;
            DeckSelectDialog.open(hr, {
                tileFaces: this._getTileFacesForGame(),
                panelBg: this.deckDialogPanelBg,
                actionButtons: this._getDialogActionButtons(),
                shopEnabled: this._shopEnabled,
                shopGroups: this._shopGroups.length > 0 ? this._shopGroups : undefined,
                deckEntries: this._shopEnabled ? getPurchasedDeckEntries(this._shopGroups) : undefined,
                onSaved: (ids) => {
                    this._game?.setDeckTypeIds(ids);
                    if (this._shopEnabled) {
                        this._game?.setTileFaceSprites(this._getTileFacesForGame());
                    }
                },
            });
        }, 0);
    }

    private _openShopDialog() {
        const hr = this._home?.node;
        if (!hr || this._homeDialogOpening) return;
        if (hr.getChildByName('ShopModal')) return;
        this._homeDialogOpening = true;
        this.scheduleOnce(() => {
            this._homeDialogOpening = false;
            if (!hr.isValid || hr.getChildByName('ShopModal')) return;
            this._rebuildShopCatalog();
            if (!this._shopEnabled) {
                this._home?.showToast('请先在 GameApp 的商店分组中配置方块贴图。');
                return;
            }

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
        }, 0);
    }

    private _enterGame() {
        linkLog('GameApp._enterGame', '点击开始 → 显示游戏页');
        if (this._home) this._home.node.active = false;
        if (this._game) {
            this._game.onBack = () => this._onGameBack();
            this._game.onLevelWin = (count) => this._onLevelWin(count);
            this._syncGameModeFlags();
            this._applyLevelClearDialog();
            this._game.setTileFaceSprites(this._getTileFacesForGame());
            this._syncDeckToGameView();
            this._game.node.active = true;
            this._game.beginOrRestartLevel(loadCurrentLevel());
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
