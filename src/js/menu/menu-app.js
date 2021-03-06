import { h, Component } from "preact";
import { observer } from "mobx-preact";
import { MENU_STATE_NAMES } from "./index";
import { GAME_STATE_NAMES } from "../states";
import StartMenu from "./components/start-menu";
import PauseMenu from "./components/pause-menu";
import DebugMenu from "./components/debug-menu";
import AboutMenu from "./components/about-menu";
import OptionsMenu from "./components/options-menu";
import InstructionsMenu from "./components/instructions-menu";
import GameOverMenu from "./components/game-over-menu";
import PlayPauseToggle from "./components/play-pause-toggle";

const maxStoredHistory = 3;
const limitArrayToRecent = (arr, numRecent) =>
  arr.length > numRecent ? arr.slice(arr.length - numRecent) : arr;

const Menu = observer(
  class Menu extends Component {
    constructor(props) {
      super(props);
      this.state = {
        menuHistory: [],
        currentMenuState: this.props.gameStore.menuState
      };
    }

    addMenuState(newState) {
      // Update the internal component state and then register the change with the gameStore
      if (newState === this.state.currentMenuState) return;
      this.setState(
        prev => {
          const newHistory = limitArrayToRecent(
            [...prev.menuHistory, prev.currentMenuState],
            maxStoredHistory
          );
          return {
            menuHistory: newHistory,
            currentMenuState: newState
          };
        },
        () => this.props.gameStore.setMenuState(this.state.currentMenuState)
      );
    }

    goBackOneState = () => {
      // Update the internal component state and then register the change with the gameStore
      if (this.state.menuHistory.length === 0) return;
      this.setState(
        prev => {
          const history = prev.menuHistory.slice();
          const newState = history.pop();
          return {
            menuHistory: history,
            currentMenuState: newState
          };
        },
        () => this.props.gameStore.setMenuState(this.state.currentMenuState)
      );
    };

    startGame = () => {
      this.props.gameStore.unpause();
      this.addMenuState(MENU_STATE_NAMES.CLOSED);
      this.props.gameStore.setGameState(GAME_STATE_NAMES.PLAY);
    };

    restartGame = () => {
      this.props.gameStore.unpause();
      this.props.gameStore.setGameState(GAME_STATE_NAMES.PLAY);
      this.props.gameStore.restartGame();
      this.addMenuState(MENU_STATE_NAMES.CLOSED);
    };

    goToStartMenu = () => {
      this.props.gameStore.unpause();
      this.addMenuState(MENU_STATE_NAMES.CLOSED);
      this.props.gameStore.setGameState(GAME_STATE_NAMES.START_MENU);
    };

    goToOptionsMenu = () => {
      this.props.gameStore.pause();
      this.addMenuState(MENU_STATE_NAMES.OPTIONS);
    };

    goToAboutMenu = () => {
      this.addMenuState(MENU_STATE_NAMES.ABOUT);
    };

    goToInstructionsMenu = () => {
      this.addMenuState(MENU_STATE_NAMES.INSTRUCTIONS);
    };

    gameOver = () => {
      this.props.gameStore.pause();
      this.addMenuState(MENU_STATE_NAMES.GAME_OVER);
    };

    resume = () => {
      this.props.gameStore.unpause();
      this.addMenuState(MENU_STATE_NAMES.CLOSED);
    };

    pause = () => {
      this.props.gameStore.pause();
      this.addMenuState(MENU_STATE_NAMES.PAUSE);
    };

    // From observer: when mobx re-renders, update the component's internal state to match
    componentWillReact() {
      if (this.state.currentMenuState !== this.props.gameStore.menuState) {
        this.addMenuState(this.props.gameStore.menuState);
      }
    }

    render() {
      const { gameStore, preferencesStore, width, height } = this.props;
      const isGameRunning = gameStore.gameState === GAME_STATE_NAMES.PLAY;

      let activeMenu;
      if (gameStore.menuState === MENU_STATE_NAMES.START_MENU) {
        activeMenu = (
          <StartMenu
            gameStore={gameStore}
            onOptions={this.goToOptionsMenu}
            onStart={this.startGame}
            onAbout={this.goToAboutMenu}
            goToInstructionsMenu={this.goToInstructionsMenu}
          />
        );
      } else if (gameStore.menuState === MENU_STATE_NAMES.PAUSE) {
        activeMenu = (
          <PauseMenu
            gameStore={gameStore}
            onMainMenu={this.goToStartMenu}
            onOptions={this.goToOptionsMenu}
            onResume={this.resume}
          />
        );
      } else if (gameStore.menuState === MENU_STATE_NAMES.DEBUG) {
        activeMenu = (
          <DebugMenu
            preferencesStore={preferencesStore}
            gameStore={gameStore}
            onResume={this.resume}
          />
        );
      } else if (gameStore.menuState === MENU_STATE_NAMES.OPTIONS) {
        activeMenu = (
          <OptionsMenu
            isClosable={isGameRunning}
            preferencesStore={preferencesStore}
            onResume={this.resume}
            onBack={this.goBackOneState}
          />
        );
      } else if (gameStore.menuState === MENU_STATE_NAMES.ABOUT) {
        activeMenu = <AboutMenu gameStore={gameStore} onBack={this.goBackOneState} />;
      } else if (gameStore.menuState === MENU_STATE_NAMES.INSTRUCTIONS) {
        activeMenu = <InstructionsMenu gameStore={gameStore} onBack={this.goBackOneState} />;
      } else if (gameStore.menuState === MENU_STATE_NAMES.INFO) {
        activeMenu = (
          <OptionsMenu
            isClosable={isGameRunning}
            preferencesStore={preferencesStore}
            onResume={this.resume}
            onBack={this.goBackOneState}
          />
        );
      } else if (gameStore.menuState === MENU_STATE_NAMES.GAME_OVER) {
        activeMenu = (
          <GameOverMenu
            gameStore={gameStore}
            onMainMenu={this.goToStartMenu}
            onRestart={this.restartGame}
          />
        );
      }

      return (
        <div id="hud" style={{ width: `${width}px`, height: `${height}px` }}>
          {activeMenu}
          {isGameRunning && (
            <PlayPauseToggle
              isPaused={gameStore.isPaused}
              onPause={this.pause}
              onResume={this.resume}
            />
          )}
        </div>
      );
    }
  }
);

export default Menu;
