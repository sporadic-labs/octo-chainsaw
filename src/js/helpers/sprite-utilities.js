exports.applyRandomLightnessTint = function (sprite, h, s, l) {
    l += sprite.game.rnd.realInRange(-0.1, 0.1);
    var rgb = Phaser.Color.HSLtoRGB(h, s, l);
    sprite.tint = Phaser.Color.getColor(rgb.r, rgb.g, rgb.b);
};

exports.checkOverlapWithGroup = function (sprite, group, callback, context) {
    // Loop through children in group
    for (var i = 0; i < group.children.length; i += 1) {
        var child = group.children[i];
        if (child instanceof Phaser.Group) {
            // If child is a group, recursion time
            exports.checkOverlapWithGroup(sprite, child, callback, context);
        } else {
            // If child is not a group, make sure it has a SAT body
            if (!child.satBody) continue;
            // Check overlap
            var isOverlap = sprite.satBody.testOverlap(child.satBody);
            if (isOverlap) callback.call(context, sprite, child);
        }
    }
};

/**
 * Recursively collide a sprite against a group using arcade physics
 */
exports.arcadeRecursiveCollide = function (sprite, group, callback, context) {
    // Loop through children in group
    for (var i = 0; i < group.children.length; i += 1) {
        var child = group.children[i];
        if (child instanceof Phaser.Group) {
            // If child is a group, recursion time
            exports.arcadeRecursiveCollide(sprite, child, callback, context);
        } else {
            var arcade = sprite.game.physics.arcade;
            arcade.collide(sprite, child, callback, null, context);
        }
    }
};


/**
 * Check a sprite's overlap against a tilemap layer using SAT bodies. This
 * creates a SAT body for tiles on-the-fly.
 *
 * @param {any} sprite The sprite with the SAT body
 * @param {TilemapLayer} tilemapLayer The tilemap layer to collide against.
 * @param {boolean} [resolveCollisions=false] Should any collisions be resolved
 * so that the sprite is no longer colliding?
 * @param {boolean} [processAllCollisions=false] Should all overlaps be checked
 * (true) or should the function stop after the first overlap (false).
 * @param {function} callback Function to run on overlap. This gets passed the
 * sprite and the tile it overlaps with.
 * @param {object} context The context to use with the callback.
 * @returns {boolean} Whether or not a collision was detected.
 */
exports.satSpriteVsTilemap = function (sprite, tilemapLayer, resolveCollisions,
        processAllCollisions, callback, context) {
    if (processAllCollisions === undefined) processAllCollisions = false;
    if (resolveCollisions === undefined) resolveCollisions = false;

    var isOverlapDetected = false; 
    var b = sprite.satBody.getAxisAlignedBounds();
    var tiles = tilemapLayer.getTiles(b.x, b.y, b.width, b.height, true);
    for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var response = sprite.satBody.collideVsRectangle({
            x: tile.worldX,
            y: tile.worldY,
            width: tile.width,
            height: tile.height
        });
        if (response !== false) {
            if (resolveCollisions) {
                sprite.body.x -= response.overlapV.x;
                sprite.body.y -= response.overlapV.y;
                sprite.satBody.postUpdate();
            }
            isOverlapDetected = true;
            if (callback) callback.call(context, sprite, tile, response);
            if (!processAllCollisions) return true;
        }
    }
    return isOverlapDetected;
};
