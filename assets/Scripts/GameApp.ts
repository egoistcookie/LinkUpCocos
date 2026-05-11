import { _decorator, Component, Node, UITransform, Widget, view } from 'cc';
import { GameView } from './game/GameView';
import { HomeView } from './game/HomeView';

const { ccclass } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
    private _home: HomeView | null = null;
    private _game: GameView | null = null;

    onLoad() {
        const vs = view.getVisibleSize();
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
    }

    start() {
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
}
