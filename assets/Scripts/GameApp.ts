import {
    _decorator,
    Camera,
    Canvas,
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
import { GameView } from './game/GameView';
import { HomeView } from './game/HomeView';
import { linkLog, linkWarn, nodePath } from './util/LinkUpDebug';
import { getStableVisibleSize } from './util/ViewSize';

const { ccclass, property } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
    /** 首页默认背景；不赋值则用纯白底图（仍可在首页用「上传」覆盖） */
    @property(SpriteFrame)
    homeBackground: SpriteFrame | null = null;

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
        this._home?.init(() => this._enterGame());
        if (this._game) {
            this._game.onBack = () => this._enterHome();
        }
    }

    private _enterGame() {
        if (this._home) this._home.node.active = false;
        if (this._game) {
            this._game.node.active = true;
            this._game.beginOrRestartLevel(1);
        }
    }

    private _enterHome() {
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
        const uiCam = canvas.getChildByName('UICamera');
        if (uiCam) {
            uiCam.setSiblingIndex(0);
        }
        canvas.layer = GameApp._defaultSceneLayerMask();

        this.unschedule(this._syncCanvasOrthoAndAppSize);
        this._syncCanvasOrthoAndAppSize();
        this.scheduleOnce(this._syncCanvasOrthoAndAppSize, 0);
    }

    /**
     * 仅用 OVERLAY + 透视主摄时，全屏 Sprite 可能被裁成三角或错位。
     * 使用「屏幕空间 - 摄像机」+ 正交 UICamera，与内置 2D 工程一致。
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
        cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        cam.visibility = GameApp._defaultSceneLayerMask();
        cam.priority = 10;

        canvasComp.cameraComponent = cam;
        const RM = (Canvas as unknown as { RenderMode?: { SCREEN_SPACE_CAMERA: number } }).RenderMode;
        canvasComp.renderMode = RM?.SCREEN_SPACE_CAMERA ?? 1;
        canvasComp.alignCanvasWithScreen = true;

        camNode.layer = canvas.layer;

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
