import Light from "./light.js";

export default class LightingPlugin extends Phaser.Plugin {
  constructor(game, pluginManager) {
    super(game, pluginManager);
    this.game = game;
    this.camera = this.game.camera;
    this.lights = [];
    this.shouldUpdateImageData = false;
    this._debugEnabled = false;
    this._pluginManager = pluginManager;
  }

  init({
    walls = [],
    parent = this.game.world,
    debugEnabled = false,
    shouldUpdateImageData = false,
    shadowOpacity = 1
  } = {}) {
    this.parent = parent;
    this.shouldUpdateImageData = shouldUpdateImageData;
    this.shadowOpacity = shadowOpacity;
    this._debugEnabled = debugEnabled;
    this._walls = walls;

    // Create a bitmap and image that can be used for dynamic lighting
    const bitmap = this.game.add.bitmapData(this.game.width, this.game.height);
    bitmap.fill(0, 0, 0, this.shadowOpacity);
    const image = bitmap.addToWorld(0, 0);
    image.fixedToCamera = true;
    image.blendMode = Phaser.blendModes.MULTIPLY;
    parent.addChild(image);
    this._bitmap = bitmap;
    this._image = image;

    if (debugEnabled) this.enableDebug();
  }

  addLight(...lightParameters) {
    const light = new Light(this.game, this.parent, ...lightParameters);
    this.lights.push(light);
    if (this._debugEnabled) light.enableDebug();
    return light;
  }

  addExistingLight(light) {
    this.lights.push(light);
    if (this._debugEnabled) light.enableDebug();
    return light;
  }

  removeLight(light) {
    const i = this.lights.indexOf(light);
    if (i !== -1) this.lights.splice(i, 1);
  }

  getWalls() {
    return this._walls;
  }

  setOpacity(opacity) {
    this.shadowOpacity = opacity;
  }

  enableDebug() {
    this._debugEnabled = true;

    if (!this._debugBitmap) {
      this._debugBitmap = this.game.add.bitmapData(this.game.width, this.game.height);
      this._debugImage = this._debugBitmap.addToWorld(0, 0);
      this.parent.addChild(this._debugImage);
      this._debugImage.fixedToCamera = true;
    }

    this._debugImage.visible = true;

    this.lights.forEach(light => light.enableDebug());

    // Hack: cycle through lights by enabling/disabling the debug mode
    if (this._debugLightIndex === undefined || this._debugLightIndex >= this.lights.length - 1) {
      this._debugLightIndex = 0;
    } else {
      this._debugLightIndex++;
    }
  }

  disableDebug() {
    this._debugEnabled = false;
    if (this._debugImage) this._debugImage.visible = false;
    this.lights.forEach(light => light.disableDebug());
  }

  isPointInShadow(worldPoint) {
    const localPoint = this._convertWorldPointToLocal(worldPoint);
    localPoint.x = Math.round(localPoint.x);
    localPoint.y = Math.round(localPoint.y);
    if (
      localPoint.x < 0 ||
      localPoint.x > this._bitmap.width ||
      localPoint.y < 0 ||
      localPoint.y > this._bitmap.height
    ) {
      // Returns true if outside of bitmap bounds...
      return true;
    }
    const color = this._bitmap.getPixel(localPoint.x, localPoint.y);
    if (color.r !== 0 || color.g !== 0 || color.b !== 0) return false;
    return true;
  }

  destroy() {
    this._bitmap.destroy();
    this._image.destroy();
    if (this._debugBitmap) this._debugBitmap.destroy();
    if (this._debugImage) this._debugImage.destroy();
    Phaser.Plugin.prototype.destroy.apply(this, arguments);
  }

  // Use postUpdate so that camera's position has a chance to update before we try to calculate
  // local screen coordinates for light rays.
  postUpdate() {
    // Clear and draw a shadow everywhere
    this._bitmap.blendSourceOver();
    this._bitmap.cls(); // Clear so shadow opacity works again
    this._bitmap.fill(0, 0, 0, this.shadowOpacity);

    if (this._debugEnabled) this._debugBitmap.clear();

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      if (!light.enabled) continue;
      light.update();
      if (light.needsRedraw) {
        const points = this._castLight(light);
        light.redraw(points); // World coordinates
      }
      this._drawLight(light);

      // Draw the light rays - this gets pretty messy with multiple lights,
      // so only draw one of them
      if (this._debugEnabled && i === this._debugLightIndex) {
        // Recalculate the points in case the light didn't need to be
        // redrawn
        const points = this._castLight(light);
        const localPoints = points.map(this._convertWorldPointToLocal, this);
        const lightPoint = this._convertWorldPointToLocal(light.position);
        for (let k = 0; k < localPoints.length; k++) {
          const p = localPoints[k];
          this._debugBitmap.line(lightPoint.x, lightPoint.y, p.x, p.y, "rgb(255, 0, 255)", 1);
          this._debugBitmap.circle(p.x, p.y, 2, "rgb(255, 0, 255)");
        }
      }
    }

    // Draw the wall normals
    if (this._debugEnabled) {
      for (let w = 0; w < this._walls.length; w++) {
        const mp = this._convertWorldPointToLocal(this._walls[w].midpoint);
        const norm = this._walls[w].normal.setMagnitude(10);
        this._debugBitmap.line(mp.x, mp.y, mp.x + norm.x, mp.y + norm.y, "rgb(255, 0, 255)", 3);
      }
    }

    // This just tells the engine it should update the texture cache
    this._bitmap.dirty = true;
    if (this._debugEnabled) this._debugBitmap.dirty = true;

    // Update the bitmap so that pixels are available. This is expensive, but necessary if you want
    // to pixel test shadows.
    if (this.shouldUpdateImageData) this._bitmap.update();
  }

  _castLight(light) {
    const points = [];
    const backWalls = light.intersectingWalls;

    // Only cast light at the walls that face away from the light. MH: this
    // appears to work well when it comes to our current, single screen design.
    // We'll need to do some testing to see if this breaks moving lights and/or
    // maps larger than the screen.
    for (let w = 0; w < backWalls.length; w++) {
      // Get start and end point for each wall.
      const wall = backWalls[w];

      const startAngle = light.position.angle(wall.line.start);
      const endAngle = light.position.angle(wall.line.end);

      // Check for an intersection at each angle, and +/- 0.001
      // Add the intersection to the points array.
      points.push(checkRayIntersection(this, startAngle - 0.001));
      points.push(checkRayIntersection(this, startAngle));
      points.push(checkRayIntersection(this, startAngle + 0.001));
      points.push(checkRayIntersection(this, endAngle - 0.001));
      points.push(checkRayIntersection(this, endAngle));
      points.push(checkRayIntersection(this, endAngle + 0.001));
    }

    // Hack for now: add additional samples to better approximate a circular
    // radius of light
    const samples = 60;
    const delta = Phaser.Math.PI2 / samples;
    for (let a = 0; a < Phaser.Math.PI2; a += delta) {
      points.push(checkRayIntersection(this, a));
    }

    // Cast a ray starting at the light position through the specified angle.
    // Check if this ray intersets any walls. If it does, return the point at
    // which it intersects the closest wall. Otherwise, return the point at
    // which it intersects the edge of the stage.
    function checkRayIntersection(ctx, angle) {
      // Create a ray from the light to a point on the circle
      const ray = light.getLightRay(angle);
      // Check if the ray intersected any walls
      const intersection = ctx._getWallIntersection(ray, backWalls, light.id);
      if (intersection) return intersection;
      return ray.end;
    }

    this._sortPoints(points, light.position);
    return points;
  }

  _drawLight(light) {
    const r = new Phaser.Rectangle(0, 0, light._bitmap.width, light._bitmap.height);
    const p = this._convertWorldPointToLocal(light.getTopLeft());
    this._bitmap.copyRect(light._bitmap, r, p.x, p.y);
  }

  _getPlayerLines() {
    // Player "walls"
    const playerLines = [];
    const player = this.game.globals.player;
    let lastX = player.x + player.body.radius;
    let lastY = player.y;
    for (let a = 0; a <= Phaser.Math.PI2; a += Phaser.Math.PI2 / 10) {
      const x = player.x + Math.cos(a) * player.body.radius;
      const y = player.y + Math.sin(a) * player.body.radius;
      playerLines.push(new Phaser.Line(lastX, lastY, x, y));
      lastX = x;
      lastY = y;
    }
    return playerLines;
  }

  _convertWorldPointToLocal(point) {
    // Find the local, screen coordinates of a point. We used to use the image's world position
    // here, but that does not appear to be properly synced in Phaser - it's one frame behind.
    return Phaser.Point.subtract(point, this.game.camera);
  }

  _sortPoints(points, target) {
    // TODO: make more efficient by sorting and caching the angle calculations
    points.sort(function(p1, p2) {
      const angle1 = Phaser.Point.angle(target, p1);
      const angle2 = Phaser.Point.angle(target, p2);
      return angle1 - angle2;
    });
  }

  // Find the closest wall that faces away from the light
  _getWallIntersection(ray, walls, lightId) {
    let distanceToWall = Number.POSITIVE_INFINITY;
    let closestIntersection = null;
    for (let i = 0; i < walls.length; i++) {
      // Check if wall faces away from the selected light
      if (walls[i].backFacings[lightId]) {
        const intersect = Phaser.Line.intersects(ray, walls[i].line);
        if (intersect) {
          // Find the closest intersection
          const distance = this.game.math.distance(
            ray.start.x,
            ray.start.y,
            intersect.x,
            intersect.y
          );
          if (distance < distanceToWall) {
            distanceToWall = distance;
            closestIntersection = intersect;
          }
        }
      }
    }
    return closestIntersection;
  }

  // Return the closest wall that this ray intersects.
  _getClosestWall(ray, walls) {
    let distanceToWall = Number.POSITIVE_INFINITY;
    let closestWall = null;

    for (let i = 0; i < walls.length; i++) {
      const intersect = Phaser.Line.intersects(ray, walls[i]);
      if (intersect) {
        // Find the closest intersection
        const distance = this.game.math.distance(
          ray.start.x,
          ray.start.y,
          intersect.x,
          intersect.y
        );
        if (distance < distanceToWall) {
          distanceToWall = distance;
          closestWall = walls[i];
        }
      }
    }
    return closestWall;
  }
}
