
/**
 * @file All materials shaders, including one vertex 
 * and one fragment shader for each material
 */
export const CARD_VERTEX_SHADER = `#version 300 es

layout(location = 0) in vec3 aPos; 
layout(location = 1) in vec2 aTexCoord;

out vec2 vTexCoord;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

void main() {
    gl_Position = projection * view * model * vec4(aPos, 1.0);
    vTexCoord = aTexCoord;
}
`

export const CARD_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 vTexCoord;

uniform mediump sampler2DArray uTextureMap;
uniform int uCardIdx;

out vec4 outColor;

const float ALPHA_TOLERANCE = 0.5;
const float MIPMAP_PRECISION = 0.6;

void main() {
    // Generating mipmap precision by derivatives
    vec2 dx = dFdx(vTexCoord) * MIPMAP_PRECISION;
    vec2 dy = dFdy(vTexCoord) * MIPMAP_PRECISION;

    // Checks if the texture is from the face or back card
    float texIndex = 0.0; 
    if(gl_FrontFacing) texIndex = float(uCardIdx);

    vec4 texColor = textureGrad(uTextureMap, vec3(vTexCoord, texIndex), dx, dy);
    
    // Check alpha tolerance and discard if necessary
    if(texColor.a < ALPHA_TOLERANCE) discard;
    outColor = texColor;
}
`

export const COIN_VERTEX_SHADER = `#version 300 es

layout(location = 0) in vec3 aPosition; 
layout(location = 1) in vec2 aTexCoord;

out vec2 vTexCoord;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

void main() {
    gl_Position = projection * view * model * vec4(aPosition, 1.0);
    vTexCoord = aTexCoord;
}
`

export const COIN_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 vTexCoord;

uniform mediump sampler2D uTextureMap;

out vec4 outColor;

const float MIPMAP_PRECISION = 0.8;
const float ALPHA_TOLERANCE = 0.6;

void main() {
    // Manually generates mipmap precision by derivatives
    vec2 dx = dFdx(vTexCoord) * MIPMAP_PRECISION;
    vec2 dy = dFdx(vTexCoord) * MIPMAP_PRECISION;

    vec4 texColor = textureGrad(uTextureMap, vTexCoord, dx, dy);
        
    // Check alpha tolerance and discard if necessary
    if(texColor.a < ALPHA_TOLERANCE) discard;
    outColor = texColor;
}
`