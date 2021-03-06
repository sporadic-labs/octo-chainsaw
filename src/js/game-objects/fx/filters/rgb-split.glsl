precision mediump float;

// Phaser built-in uniforms: https://photonstorm.github.io/phaser-ce/Phaser.Filter.html
varying vec2 vTextureCoord; // UV coorindates, in range 0 - 1
uniform sampler2D uSampler; // Texture
uniform float time; // Seconds

// Custom uniforms
uniform vec2 resolution; // Resolution of the screen
uniform float displacement; // Pixels

// Pseudo random: https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
float rand(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
    // Pixels to UV displacement, based on horizontal resolution
    float uvDisplacement = displacement / resolution.x;
    // Calculate a random direction to displace
    float angle = rand(time);
    vec2 direction = vec2(cos(angle), sin(angle));
    // Pull the normal RGB color and then displace the R and B channels in opposite directions
    gl_FragColor = texture2D(uSampler, vTextureCoord);
    gl_FragColor.r = texture2D(uSampler, vTextureCoord + (uvDisplacement * direction)).r;
    gl_FragColor.b = texture2D(uSampler, vTextureCoord + (uvDisplacement * -direction)).b;
}