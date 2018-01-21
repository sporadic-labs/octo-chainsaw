import Color from "../../helpers/color";
import HealthBar from "./components/health-bar.js";
import TargetingComp from "./components/targeting-component";
import DashAttackComp from "./components/dash-attack-component";
import { debugShape } from "../../helpers/sprite-utilities";
import FlashSilhouetteFilter from "./components/flash-silhouette-filter";
import { ENEMY_INFO, ENEMY_TYPES } from "./enemy-info";
import ProjectileAttackComponent from "./components/projectile-attack-component";
import SplitOnDeathComponent from "./components/split-on-death-component";
import EnemySpawnIndicator from "./enemy-spawn-indicator";

const ANIM = {
  MOVE: "MOVE",
  HIT: "HIT",
  DEATH: "DEATH"
};

export default class Enemy extends Phaser.Sprite {
  static MakeEnemyType(game, type, position, enemyGroup) {
    const info = ENEMY_INFO[type] || {};
    const key = info.key || "";
    const enemy = new Enemy(game, "assets", key, position, enemyGroup, type, {
      health: 100,
      speed: 160,
      visionRadius: null,
      collisionPoints: info.collisionPoints || [],
      animated: info.animated
    });
    return enemy;
  }

  static SpawnWithIndicator(game, type, position, enemyGroup, spawnTime = 3000) {
    const indicator = new EnemySpawnIndicator(game, position.x, position.y, spawnTime);
    enemyGroup.add(indicator);
    indicator.onFinished.addOnce(() => Enemy.MakeEnemyType(game, type, position, enemyGroup));
  }

  constructor(
    game,
    key,
    frame,
    position,
    enemyGroup,
    type,
    {
      animated = true,
      health = 100,
      color = 0xffffff,
      speed = 100,
      visionRadius = 200,
      collisionPoints = []
    } = {}
  ) {
    super(game, position.x, position.y, key, animated ? `${frame}/move_00` : frame);
    this.anchor.set(0.5);

    this._components = [];
    this.type = type;
    switch (this.type) {
      case ENEMY_TYPES.BACTERIA: {
        this._components.push(new TargetingComp(this, speed, visionRadius));
        break;
      }
      case ENEMY_TYPES.BEETLE: {
        this._components.push(new TargetingComp(this, speed, visionRadius));
        break;
      }
      case ENEMY_TYPES.WORM: {
        const targeting = new TargetingComp(this, speed, visionRadius);
        const dash = new DashAttackComp(this, 2 * speed, targeting);
        this._components.push(targeting, dash);
        break;
      }
      case ENEMY_TYPES.VIRUS: {
        const targeting = new TargetingComp(this, speed, visionRadius);
        const projectile = new ProjectileAttackComponent(this, targeting);
        this._components.push(targeting, projectile);
        break;
      }
      case ENEMY_TYPES.AMOEBA: {
        const targeting = new TargetingComp(this, speed * 3 / 4, visionRadius);
        const splitOnDeath = new SplitOnDeathComponent(this, targeting);
        this._components.push(targeting, splitOnDeath);
        break;
      }
      case ENEMY_TYPES.AMOEBA_SMALL: {
        const targeting = new TargetingComp(this, speed, visionRadius);
        this._components.push(targeting);
        break;
      }
      default: {
        console.log("Invalid enemy type specified, using default Targeting Component!");
        this._components.push(new TargetingComp(this, speed, visionRadius));
        break;
      }
    }

    // Add this enemy to the Enemies group.
    enemyGroup.addEnemy(this);
    this.enemyGroup = enemyGroup;

    const colorObj = color instanceof Color ? color : new Color(color);
    this.tint = colorObj.getRgbColorInt();

    const cx = 0;
    const cy = this.height / 2 + 4;
    const fg = game.globals.groups.foreground; // Temp fix: move health above the shadows
    this._healthBar = new HealthBar(game, this, fg, cx, cy, 20, 4);
    this._healthBar.initHealth(health);

    // Animations
    const genFrameNames = Phaser.Animation.generateFrameNames;
    const moveFrames = animated ? genFrameNames(`${frame}/move_`, 0, 15, "", 2) : [frame];
    const hitFrames = animated ? genFrameNames(`${frame}/hit_`, 0, 15, "", 2) : [frame];
    const deathFrames = animated ? genFrameNames(`${frame}/death_`, 0, 15, "", 2) : [frame];
    this.animations.add(ANIM.MOVE, moveFrames, 24, true);
    this.animations.add(ANIM.HIT, hitFrames, 64, false).onComplete.add(() => {
      this.animations.play(ANIM.MOVE);
    }, this);
    this.animations.add(ANIM.DEATH, deathFrames, 64, false).onComplete.add(() => {
      this.destroy();
    });

    // Sound fx
    this._hitSound = this.game.globals.soundManager.add("squish-impact-faster", 5);
    this._deathSound = this.game.globals.soundManager.add("squish");

    // Config arcade and SAT body physics
    // - Arcade physics hitbox is small. It is used to allow enemies to move without jostling one
    //   another and to be conservative when checking if enemy has reached the player.
    // - SAT body hitbox is used for the bullet to be liberal with determining when a bullet has hit
    //   an enemy
    game.physics.arcade.enable(this);
    // const diameter = 0.2 * this.width; // Fudge factor - body smaller than sprite
    const diameter = 0.5 * this.width; // Temp
    this.body.setCircle(diameter / 2, (this.width - diameter) / 2, (this.height - diameter) / 2);
    this.body.collideWorldBounds = true;
    // Counter-clockwise points (in range [0, 1]) need to be shifted so that the center is in the
    // middle of the graphic and then scaled to match sprite's scale.
    const points = collisionPoints.map(p => ({
      x: (p[0] - 0.5) * this.width,
      y: (p[1] - 0.5) * this.height
    }));
    this.satBody = this.game.globals.plugins.satBody.addPolygonBody(this, points);

    // Spawn animation
    this.scale.setTo(0.5, 0.5);
    this.animations.play(ANIM.MOVE);
    this.game.make
      .tween(this.scale)
      .to({ x: 1.4, y: 1.4 }, 100, Phaser.Easing.Bounce.In)
      .to({ x: 1, y: 1 }, 150, Phaser.Easing.Quadratic.Out)
      .start();

    // Disabling the hit flash filter. It really tanks performance. When we have this effect baked
    // into enemy hit animation, it's safe to remove this code.
    // this._flashFilter = new FlashSilhouetteFilter(game);
    // this.filters = [this._flashFilter];

    // Set the isDead flag.
    this.isDead = false;
  }

  takeDamage(damage, projectile) {
    if (this.isDead) return false;
    const newHealth = this._healthBar.incrementHealth(-damage);
    // this._flashFilter.startFlash();
    // TODO(rex): Play the flash animation frames.
    if (newHealth <= 0) {
      if (projectile && projectile.body) {
        // TODO: handle player dash
        const angle = Math.atan2(projectile.body.velocity.y, projectile.body.velocity.x);
        this.enemyGroup.emitDeathParticles(projectile.position, angle);
      }
      this.die();
      this._deathSound.play();
      this.animations.play(ANIM.DEATH);
      return true;
    }
    this.animations.play(ANIM.HIT);
    this._hitSound.play();
    return false;
  }

  update() {
    if (this.isDead) return;
    for (const component of this._components) component.update();
    super.update();
  }

  die() {
    this.isDead = true;
    // If this is an Amoeba, with a SplitOnDeath component, activate the splitOnDeath method.
    if (this.type === ENEMY_TYPES.AMOEBA) {
      const splitComponent = this._components.find(c => {
        return c instanceof SplitOnDeathComponent;
      });
      if (splitComponent) splitComponent.splitOnDeath();
    }
    this.satBody.destroy();
    this.body.destroy();
  }

  postUpdate(...args) {
    // Post updates are where movement physics are applied. We want all post updates to finish
    // BEFORE placing extracting the sprite's position
    super.postUpdate(...args);
    // Now extract sprite position and apply it to the group
    this._healthBar.updatePosition();
  }

  destroy(...args) {
    this.game.tweens.removeFrom(this);
    this.game.tweens.removeFrom(this.scale);
    this._healthBar.destroy();
    for (const component of this._components) component.destroy();
    super.destroy(...args);
  }
}
