module.exports = ShadowEnemy;

var BaseEnemy = require("./base-enemy.js");

ShadowEnemy.prototype = Object.create(BaseEnemy.prototype);

function ShadowEnemy(game, x, y, parentGroup) {
    BaseEnemy.call(this, game, x, y, "assets", "shadow-enemy/idle-01", 100,
        parentGroup);

    this._maxSpeed = 50;
    this._damage = 10 / 1000; // 10 units per second
    this._target = null;

    this._findTarget();

    // Override from BaseEnemy
    var diameter = 0.7 * this.width; // Fudge factor - body smaller than sprite
    this.body.setCircle(diameter / 2, (this.width - diameter) / 2, 
        (this.height - diameter) / 2);
    this.satBody = this.game.globals.plugins.satBody.addCircleBody(this, 
        diameter / 2);

    this.body.angularVelocity = this.game.rnd.sign() *
        this.game.rnd.realInRange(25, 35);
}

ShadowEnemy.prototype.update = function () {
    // Collisions with the tilemap
    this.game.physics.arcade.collide(this, this.game.globals.tileMapLayer);
    // Stop moving
    this.body.velocity.set(0);
    // Update target
    if (!this._target || (this._target.health <= 0)) this._findTarget();
    
    // Calculate path
    var tilemapLayer = this.game.globals.tileMapLayer;
    var start = tilemapLayer.getTileXY(this.x, this.y, {});
    var goal = tilemapLayer.getTileXY(this._target.x, this._target.y, {});
    var path = this.game.globals.plugins.astar.findPath(start, goal);

    // If there is an a* path to the target, move to the next node in the path
    if (path.nodes.length) {
        var tileHeight = this.game.globals.tileMap.tileHeight;
        var tileWidth = this.game.globals.tileMap.tileWidth;
        var nextNode = path.nodes[path.nodes.length - 1];
        var nextTargetPoint = new Phaser.Point(
            nextNode.x * tileWidth + tileWidth / 2, 
            nextNode.y * tileHeight + tileHeight / 2
        );
        this._moveTowards(nextTargetPoint);
    }

    // If in range of target, attack
    var distance = this.position.distance(this._target.position);
    if (distance < 30) {
        this._target.health -= (this._damage * this.game.time.elapsedMS);
    }
};

ShadowEnemy.prototype._moveTowards = function (position) {
    var distance = this.position.distance(position);
    var angle = this.position.angle(position);
    var targetSpeed = distance / this.game.time.physicsElapsed;
    var magnitude = Math.min(this._maxSpeed, targetSpeed);
    this.body.velocity.x = magnitude * Math.cos(angle);
    this.body.velocity.y = magnitude * Math.sin(angle);
};

ShadowEnemy.prototype._findTarget = function () {
    var lights = this.game.globals.groups.lights;

    // Reset the target and distance
    this._target = null;
    var targetDistance = null;

    // Target the closest light
    lights.forEach(function (light) {
        var distance = this.world.distance(light.position);
        if ((targetDistance === null) || distance < targetDistance) {
            this._target = light;
            targetDistance = distance;
        }
    }, this);

    // If there are no lights left, attack the player
    if (this._target === null) {
        this._target = this.game.globals.player;
    }
};