module.exports = ShadowEnemy;

var BaseEnemy = require("./base-enemy.js");
var Color = require("../../helpers/Color.js");
var AvoidComp = require("../components/avoid-component");
var TargetingComp = require("../components/targeting-component");

ShadowEnemy.prototype = Object.create(BaseEnemy.prototype);

function ShadowEnemy(game, x, y, parentGroup, color, shieldColor) {
    BaseEnemy.call(this, game, x, y, "assets", "shadow-enemy/tintable-idle", 100,
        parentGroup, 1, color);

    // Temp fix: move the health bar above the shadow/light layer
    game.globals.groups.foreground.add(this._healthBar);

    this._movementComponent = null;
    this._components = [];

    this._damage = 10; // 10 units per second

    // If there wasn't a shieldColor provided, set the shieldColor and shield to null.
    if (!shieldColor) {
        this._shieldColor = null;
        this._shield = null;
    } else {
        // If a shieldColor param was provided, you want a shield!
        // Add the shield as a child sprite of the shadow enemy.
        this._shield = game.add.sprite(0, 0, "assets", "shadow-enemy/outline");
        this._shield.anchor.set(0.5);
        // Also tint the shield based on the shield color!
        this._shieldColor = shieldColor instanceof Color ? shieldColor : new Color(shieldColor);
        this._shield.tint = this._shieldColor.getRgbColorInt();
        this.addChild(this._shield);
    }

    // Override from BaseEnemy
    var diameter = 0.1 * this.width; // Fudge factor - body smaller than sprite
    this.body.setCircle(diameter / 2, (this.width - diameter) / 2, 
        (this.height - diameter) / 2);
    this.body.collideWorldBounds = true;
    this.satBody = this.game.globals.plugins.satBody.addCircleBody(this);

    this.body.angularVelocity = this.game.rnd.sign() *
        this.game.rnd.realInRange(25, 35);

    this._dieSound = this.game.globals.soundManager.add("pop");
    this._dieSound.playMultiple = true;
    
    // If the level has changed, make sure the enemy is not inside of a wall
    this._levelManager = game.globals.levelManager;
    this._levelManager.levelChangeSignal.add(this._checkCollision, this);

    this._timer = game.time.create(false);
    this._timer.start();
}

ShadowEnemy.prototype._checkCollision = function () {
    const wallLayer = this._levelManager.getCurrentWallLayer();

    // Get all colliding tiles that are within range and destroy if there are any
    const pad = 0;
    const tiles = wallLayer.getTiles(
        this.position.x - pad, this.position.y - pad,
        this.width + pad, this.height + pad, 
        true
    );
    if (tiles.length > 0) this.destroy();
};

// ShadowEnemy.prototype.addComponent = function (component) {
//     this._components.push(component);
// };

// ShadowEnemy.prototype.removeComponent = function (component) {
//     const i = this._components.indexOf(component);
//     if (i !== -1) this._components.splice(i, 1);
// };

ShadowEnemy.prototype.update = function () {
    // If the enemy hasn't spawned yet, don't move or attack!
    if (!this._spawned) return;

    // Collisions with the tilemap
    this.game.physics.arcade.collide(this, this.game.globals.levelManager.getCurrentWallLayer());
    
    if (this._movementComponent) this.movementComponent.update();

    // Update any components - loop in reverse to allow components to be removed
    // for (let i = this._components.length - 1; i >= 0; i--) {
    //     this._components[i].update();
    // }
};

ShadowEnemy.prototype.enterGhostMode = function (duration) {
    const speed = this._movementComponent ? this._movementComponent.speed : 100;
    this.movementComponent = new AvoidComp(this, this._player, speed);
    this._timer.add(duration, function () {
        this.movementComponent = new TargetingComp(this, speed);
    }, this);
};

ShadowEnemy.prototype.destroy = function () {
    this._timer.destroy();
    this._levelManager.levelChangeSignal.remove(this._checkCollision, this);
    this._dieSound.play();

    if (this._movementComponent) this._movementComponent.destroy();
    for (const component of this._components) component.destroy();
    BaseEnemy.prototype.destroy.apply(this, arguments);
};

Object.defineProperty(ShadowEnemy.prototype, "movementComponent", {
    get: function() { 
        return this._movementComponent; 
    },
    set: function(newComponent) { 
        if (this._movementComponent) this._movementComponent.destroy();
        this._movementComponent = newComponent; 
    }
});