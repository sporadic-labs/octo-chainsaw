/**
 * Sandbox - this is the main level for now
 */

import PickupSpawner from "../game-objects/pickups/pickup-spawner.js";
// import LightingPlugin from "../plugins/lighting-plugin/lighting-plugin.js";
import LightingPlugin from "../plugins/lighting-plugin-optimized/lighting-plugin.js";
import Player from "../game-objects/player";
import SoundEffectManager from "../game-objects/fx/sound-effect-manager.js";
import EffectsPlugin from "../plugins/camera-effects-plugin/camera-effects-plugin.js";
import PostProcessor from "../game-objects/fx/post-processor.js";
import { MENU_STATE_NAMES } from "../menu";
import { gameStore, preferencesStore } from "../game-data/observable-stores";
import { autorun } from "mobx";
import MapManager from "../game-objects/level-manager";
import EnemySpawner from "../game-objects/enemies/enemy-spawner";
import EnemyGroup from "../game-objects/enemies/enemy-group";
import EnergyPickup from "../game-objects/pickups/energy-pickup";
import WeaponSpawner from "../game-objects/pickups/weapon-spawner";
import WEAPON_TYPES from "../game-objects/weapons/weapon-types";
import Score from "../game-objects/hud/score";
import Combo from "../game-objects/hud/combo";
import Radar from "../game-objects/hud/radar/";
import Ammo from "../game-objects/hud/ammo";
import DashIcon from "../game-objects/hud/dash-icon";
import AudioProcessor from "../game-objects/fx/audio-processor";
import PopUpText from "../game-objects/hud/pop-up-text";
import getFontString from "../fonts/get-font-string";
import SatBodyPlugin from "../plugins/sat-body-plugin-revisited/plugin";
import DifficultyModifier from "../game-objects/difficulty-modifier";
import { registerGameStart } from "../analytics";
import ImageBar from "../game-objects/hud/image-bar";
import WaveHud from "../game-objects/hud/wave";
import HudMessageDisplay from "../game-objects/hud/hud-message-display";

export default class PlayState extends Phaser.State {
  create() {
    registerGameStart();

    gameStore.setMenuState(MENU_STATE_NAMES.CLOSED);

    // Shorthands
    const game = this.game;
    const globals = game.globals;

    // Groups for z-index sorting and for collisions
    const groups = {
      game: game.add.group(this.world, "game"),
      gameOverlay: game.add.group(this.world, "game-overlay"),
      hud: game.add.group(this.world, "hud")
    };
    groups.hud.fixedToCamera = true;
    groups.background = game.add.group(groups.game, "background");
    groups.midground = game.add.group(groups.game, "midground");
    groups.foreground = game.add.group(groups.game, "foreground");
    groups.pickups = game.add.group(groups.midground, "pickups");
    groups.enemies = new EnemyGroup(game, groups.midground);
    groups.nonCollidingGroup = game.add.group(groups.midground, "non-colliding");
    globals.groups = groups;

    // Plugins
    global.plugins = global.plugins !== undefined ? global.plugins : {};
    globals.plugins.satBody = game.plugins.add(SatBodyPlugin);
    globals.plugins.effects = game.plugins.add(EffectsPlugin);

    // Level manager
    const mapName = globals.tilemapNames[0];
    const mapManager = new MapManager(game, mapName, groups.background, groups.foreground);
    globals.mapManager = mapManager;

    // Lighting plugin - needs to be set up after level manager
    globals.plugins.lighting = game.plugins.add(LightingPlugin, {
      parent: groups.foreground,
      walls: mapManager.walls,
      shouldUpdateImageData: false,
      shadowOpacity: 1,
      debugEnabled: false
    });
    this.lighting = globals.plugins.lighting;

    // Sound manager
    globals.soundManager = new SoundEffectManager(this.game);

    // Difficulty
    globals.difficultyModifier = new DifficultyModifier();

    // Physics
    this.physics.startSystem(Phaser.Physics.ARCADE);
    this.physics.arcade.gravity.set(0);

    globals.postProcessor = new PostProcessor(game, globals.groups.game);
    globals.audioProcessor = new AudioProcessor(game);

    // Player
    // Setup a new player, and attach it to the global variabls object.
    const spawnObjects = mapManager.tilemap.objects["player-spawn"] || [];
    const spawnPoint =
      spawnObjects.length > 0
        ? { x: spawnObjects[0].x, y: spawnObjects[0].y }
        : { x: this.world.width / 2, y: this.world.height / 2 };
    const player = new Player(game, spawnPoint.x, spawnPoint.y, groups.foreground);
    globals.player = player;

    game.world.setBounds(0, 0, mapManager.tilemap.widthInPixels, mapManager.tilemap.heightInPixels);
    game.camera.follow(player);

    // Waves of pickups and enemies
    new PickupSpawner(game);
    const enemySpawner = new EnemySpawner(game, player);
    this.enemySpawner = enemySpawner;
    const weaponSpawner = new WeaponSpawner(game, groups.pickups, player, mapManager);

    // HUD
    const hudMessageDisplay = new HudMessageDisplay(game, groups.hud);
    new Radar(game, groups.foreground, player, this.game.globals.groups.enemies, weaponSpawner);
    const combo = new Combo(game, groups.hud, player, globals.groups.enemies);
    combo.position.set(this.game.width - 5, 32);
    const score = new Score(game, groups.hud, globals.groups.enemies, combo, hudMessageDisplay);
    score.position.set(this.game.width - 5, 5);
    const ammo = new Ammo(game, groups.hud, player, weaponSpawner);
    ammo.position.set(game.width - 5, game.height - 5);
    this.add.sprite(4, 4, "assets", "hud/health-icon", groups.hud);
    const dashIcon = new DashIcon(game, groups.hud, player);
    dashIcon.position.set(4, 36);
    const playerHealth = new ImageBar(game, groups.hud, {
      x: 35,
      y: 7,
      interiorKey: "hud/health-bar-interior",
      outlineKey: "hud/health-bar-outline"
    });
    player.onHealthChange.add(newHealth => playerHealth.setValue(newHealth));
    new WaveHud(game, groups.hud, enemySpawner.onWaveSpawn);

    // Difficulty toast messages
    globals.difficultyModifier.onDifficultyChange.add((previousDifficulty, difficulty) => {
      const truncatedPreviousDifficulty = Math.floor(previousDifficulty * 10) / 10;
      const truncatedDifficulty = Math.floor(difficulty * 10) / 10;
      if (truncatedDifficulty > truncatedPreviousDifficulty) {
        // Difficulty has changed in the 10s decimal place
        hudMessageDisplay.setMessage(`${truncatedDifficulty.toFixed(2)}x speed`);
      }
    });

    // Combo "toast" messages
    weaponSpawner.onPickupCollected.add(pickup => {
      const location = Phaser.Point.add(pickup, new Phaser.Point(0, -30));
      const w = player.weaponManager.getActiveWeapon();
      new PopUpText(game, globals.groups.foreground, w.getName(), location);
    });

    globals.groups.enemies.onEnemyKilled.add(enemy => {
      new EnergyPickup(this.game, enemy.x, enemy.y, globals.groups.pickups, player);
    });

    // Use the 'P' button to pause/unpause, as well as the button on the HUD.
    game.input.keyboard.addKey(Phaser.Keyboard.P).onDown.add(() => {
      if (gameStore.isPaused) {
        gameStore.setMenuState(MENU_STATE_NAMES.CLOSED);
        gameStore.unpause();
      } else {
        gameStore.setMenuState(MENU_STATE_NAMES.PAUSE);
        gameStore.pause();
      }
    });

    // Subscribe to the debug settings
    this.storeUnsubscribe = autorun(() => {
      this.lighting.setOpacity(preferencesStore.shadowOpacity);
      if (preferencesStore.physicsDebug) this.physics.sat.world.enableDebug();
      else this.physics.sat.world.disableDebug();
      globals.postProcessor.visible = preferencesStore.shadersEnabled;
      game.paused = gameStore.isPaused;
    });
    // Note: pausing and unpausing mutes/unmutes Phaser's sound manager. Changing the volume while
    // muted will be ignored. Instead, sync volume any time the game is unmuted.
    this.game.sound.onUnMute.add(() => (this.game.sound.volume = preferencesStore.volume));
    this.game.sound.volume = preferencesStore.volume; // Sync volume on first load

    // Optional debug menu, pause w/o menus, switch weapons and fps text
    if (!this.game.debug.isDisabled) {
      game.input.keyboard.addKey(Phaser.Keyboard.E).onDown.add(() => {
        gameStore.setMenuState(MENU_STATE_NAMES.DEBUG);
        gameStore.pause();
      });

      game.input.keyboard.addKey(Phaser.Keyboard.R).onDown.add(() => {
        groups.enemies.killAll();
      });

      // Force spawning waves
      game.input.keyboard.addKey(Phaser.Keyboard.K).onDown.add(() => enemySpawner._spawnWave());
      game.input.keyboard
        .addKey(Phaser.Keyboard.L)
        .onDown.add(() => enemySpawner._spawnSpecialWave());

      // Pause without menus showing up.
      game.input.keyboard.addKey(Phaser.Keyboard.O).onDown.add(() => {
        // NOTE(rex): Only allowed if all menus are closed already.
        if (gameStore.menuState === MENU_STATE_NAMES.CLOSED && gameStore.isPaused) {
          gameStore.unpause();
        } else if (gameStore.menuState === MENU_STATE_NAMES.CLOSED && !gameStore.isPaused) {
          gameStore.pause();
        }
      });

      /* Manually switch weapons with the number keys.
       */
      const keys = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
      const weapons = Object.values(WEAPON_TYPES);
      for (let i = 0; i < Math.min(keys.length, weapons.length); i++) {
        const key = Phaser.Keyboard[keys[i]];
        const weaponType = weapons[i];
        game.input.keyboard.addKey(key).onDown.add(() => {
          if (gameStore.menuState === MENU_STATE_NAMES.CLOSED) {
            player.weaponManager.switchWeapon(weaponType);
            ammo.updateWeapon();
          }
        });
      }

      // FPS
      this._fpsText = game.make.text(5, game.height - 38, "60", {
        font: getFontString("Montserrat", { size: "12px", weight: 400 }),
        fill: "#00ffff"
      });
      this._fpsText.anchor.set(0, 1);
      groups.hud.add(this._fpsText);

      // this._inLightText = game.make.text(
      //   game.width - 25,
      //   game.height - 100,
      //   "Is Mouse In Light: ",
      //   { font: "18px 'Alfa Slab One'", fill: "#9C9C9C" }
      // );
      // this._inLightText.anchor.set(1, 1);
      // groups.hud.add(this._inLightText);
    }
  }

  update() {
    if (this._fpsText) {
      this._fpsText.setText(this.game.time.fps);
    }

    if (this._inLightText) {
      const isMouseInShadow = this.game.globals.player._playerLight.isPointInShadow(
        Phaser.Point.add(this.camera.position, this.input.mousePointer.position)
      );
      this._inLightText.setText("Is Mouse In Light: " + (isMouseInShadow ? "No" : "Yes"));
    }
  }

  shutdown() {
    this.enemySpawner.destroy();
    this.storeUnsubscribe();
    // Destroy all plugins (MH: should we be doing this or more selectively removing plugins?)
    this.game.plugins.removeAll();
  }
}
