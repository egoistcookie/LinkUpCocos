import {
    _decorator,
    AudioClip,
    Button,
    Camera,
    Canvas,
    Color,
    Component,
    director,
    Graphics,
    Label,
    Layers,
    Node,
    Size,
    Sprite,
    SpriteFrame,
    UITransform,
    Widget,
    view,
} from 'cc';
import { GameView, type GameSfxConfig, type GameToolButtonSprites, type NoConnectDialogConfig } from './game/GameView';
import { HomeView, type HomeMainButtonSprites } from './game/HomeView';
import { DeckSelectDialog } from './game/DeckSelectDialog';
import { TILE_SPRITE_SLOTS } from './game/LinkUpBoard';
import { getConfiguredTypeIds, loadDeckTypeIdsForGame, MIN_DECK_TYPE_COUNT } from './util/DeckSelectionStorage';
import { linkDumpNode, linkLayerVsCamera, linkLog, linkWarn, nodePath } from './util/LinkUpDebug';
import { getStableVisibleSize, getLayoutSizeForNode } from './util/ViewSize';

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

    /**
     * 棋盘格子贴图：第 i 项对应「i+1 号」类型。
     * 若 32 项都配置了贴图：与原先一致，无贴图槽位不会用到。
     * 若未满 32 种：盘面只生成已配置的类型、不显示数字；未配置的槽位不参与发牌。
     */
    @property({
        type: [SpriteFrame],
        tooltip: `共 ${TILE_SPRITE_SLOTS} 项：索引 0→1号 …；未满 32 种时仅用已配贴图的类型发牌且不显示数字`,
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
    /** 点击「提示」 */
    @property(AudioClip)
    sfxHint: AudioClip | null = null;
    /** 点击「刷新」 */
    @property(AudioClip)
    sfxRefresh: AudioClip | null = null;
    /** 点击「消除」 */
    @property(AudioClip)
    sfxEliminate: AudioClip | null = null;

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
    /** 商店弹窗底板（占位）；不配置则用深色底板 */
    @property(SpriteFrame)
    shopDialogPanelBg: SpriteFrame | null = null;

    private _home: HomeView | null = null;
    private _game: GameView | null = null;

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
        this._home?.setConfiguredBackground(this.homeBackground);
        if (this._game) {
            this._game.onBack = () => this._enterHome();
            this._game.setTileFaceSprites(this.tileFaceSprites ?? []);
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
            const sfx: GameSfxConfig = {
                connect: this.sfxConnect,
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
        }
        this.scheduleOnce(() => this._debugPipelineSnapshot('GameApp.start+0'), 0);
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
        const faces = this.tileFaceSprites ?? [];
        const configured = getConfiguredTypeIds(faces);
        if (configured.length >= MIN_DECK_TYPE_COUNT) {
            const ids = loadDeckTypeIdsForGame(faces);
            if (ids && ids.length >= MIN_DECK_TYPE_COUNT) this._game?.setDeckTypeIds(ids);
            else this._game?.setDeckTypeIds(null);
        } else {
            this._game?.setDeckTypeIds(null);
        }
    }

    private _onHomeStartGame() {
        const faces = this.tileFaceSprites ?? [];
        const configured = getConfiguredTypeIds(faces);
        if (configured.length >= MIN_DECK_TYPE_COUNT) {
            const ids = loadDeckTypeIdsForGame(faces);
            if (!ids || ids.length < MIN_DECK_TYPE_COUNT) {
                this._home?.showToast(
                    `请先在「配置卡组」中选择至少 ${MIN_DECK_TYPE_COUNT} 种方块后再开始游戏。`,
                );
                return;
            }
            this._game?.setDeckTypeIds(ids);
        } else if (configured.length > 0) {
            this._home?.showToast(
                `使用方块贴图时，请至少在 GameApp 中配置 ${MIN_DECK_TYPE_COUNT} 种格子贴图；当前仅 ${configured.length} 种。配置满 ${MIN_DECK_TYPE_COUNT} 种后，还需在「配置卡组」中勾选至少 ${MIN_DECK_TYPE_COUNT} 种。`,
            );
            return;
        } else {
            this._game?.setDeckTypeIds(null);
        }
        this._enterGame();
    }

    private _openDeckDialog() {
        const hr = this._home?.node;
        if (!hr) return;
        DeckSelectDialog.open(hr, {
            tileFaces: this.tileFaceSprites ?? [],
            panelBg: this.deckDialogPanelBg,
            onSaved: (ids) => this._game?.setDeckTypeIds(ids),
        });
    }

    private _openShopDialog() {
        const hr = this._home?.node;
        if (!hr) return;
        if (hr.getChildByName('ShopModal')) return;

        const vs = getLayoutSizeForNode(hr);
        const root = new Node('ShopModal');
        root.setParent(hr);
        root.setSiblingIndex(hr.children.length - 1);
        const rw = root.addComponent(UITransform);
        rw.setContentSize(vs.width, vs.height);
        const wg = root.addComponent(Widget);
        wg.isAlignTop = wg.isAlignBottom = wg.isAlignLeft = wg.isAlignRight = true;
        wg.top = wg.bottom = wg.left = wg.right = 0;
        wg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        wg.updateAlignment();

        const dim = new Node('Dim');
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(vs.width, vs.height);
        const dW = dim.addComponent(Widget);
        dW.isAlignTop = dW.isAlignBottom = dW.isAlignLeft = dW.isAlignRight = true;
        dW.top = dW.bottom = dW.left = dW.right = 0;
        dW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        dW.updateAlignment();
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(0, 0, 0, 160);
        dg.fillRect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
        const dimBtn = dim.addComponent(Button);
        dimBtn.transition = Button.Transition.NONE;
        dim.on(Button.EventType.CLICK, () => root.destroy(), this);

        const panelW = Math.min(440, vs.width - 40);
        const panelH = 220;
        const panel = new Node('Panel');
        panel.setParent(root);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pWg = panel.addComponent(Widget);
        pWg.isAlignHorizontalCenter = true;
        pWg.isAlignVerticalCenter = true;
        pWg.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        pWg.updateAlignment();

        if (!this.shopDialogPanelBg) {
            const pg = panel.addComponent(Graphics);
            pg.fillColor = new Color(0x1b, 0x26, 0x3b, 245);
            pg.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);
        } else {
            const sp = panel.addComponent(Sprite);
            sp.spriteFrame = this.shopDialogPanelBg;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.color = Color.WHITE;
        }

        const titleN = new Node('Title');
        titleN.setParent(panel);
        titleN.setPosition(0, panelH / 2 - 40, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 24, 36);
        const tl = titleN.addComponent(Label);
        tl.string = '商店';
        tl.fontSize = 26;
        tl.color = new Color(0xe9, 0xc4, 0x6a, 255);
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;

        const msgN = new Node('Msg');
        msgN.setParent(panel);
        msgN.setPosition(0, -8, 0);
        msgN.addComponent(UITransform).setContentSize(panelW - 40, 80);
        const ml = msgN.addComponent(Label);
        ml.string = '商店功能即将开放，敬请期待。';
        ml.fontSize = 22;
        ml.color = Color.WHITE;
        ml.horizontalAlign = Label.HorizontalAlign.CENTER;
        ml.verticalAlign = Label.VerticalAlign.CENTER;
        ml.overflow = Label.Overflow.RESIZE_HEIGHT;

        const closeN = new Node('Close');
        closeN.setParent(panel);
        closeN.setPosition(0, -panelH / 2 + 44, 0);
        closeN.addComponent(UITransform).setContentSize(160, 48);
        const cg = closeN.addComponent(Graphics);
        cg.fillColor = new Color(0x2d, 0x6a, 0x4f, 255);
        cg.fillRect(-80, -24, 160, 48);
        const cbtn = closeN.addComponent(Button);
        cbtn.transition = Button.Transition.NONE;
        const clN = new Node('Label');
        clN.setParent(closeN);
        clN.addComponent(UITransform).setContentSize(160, 48);
        const cl = clN.addComponent(Label);
        cl.string = '关闭';
        cl.fontSize = 22;
        cl.color = Color.WHITE;
        cl.horizontalAlign = Label.HorizontalAlign.CENTER;
        cl.verticalAlign = Label.VerticalAlign.CENTER;
        closeN.on(Button.EventType.CLICK, () => root.destroy(), this);
    }

    private _enterGame() {
        linkLog('GameApp._enterGame', '点击开始 → 显示游戏页');
        if (this._home) this._home.node.active = false;
        if (this._game) {
            this._game.node.active = true;
            this._game.beginOrRestartLevel(1);
        }
    }

    private _enterHome() {
        linkLog('GameApp._enterHome', '返回首页');
        if (this._game) this._game.node.active = false;
        if (this._home) this._home.node.active = true;
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
