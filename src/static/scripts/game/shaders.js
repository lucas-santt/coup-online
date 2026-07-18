// QUAD or CARD shader?
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

out vec4 outColor;

const float ALPHA_TOLERANCE = 0.5;
const float MIPMAP_PRECISION = 0.6;

void main() {
    vec2 dx = dFdx(vTexCoord) * MIPMAP_PRECISION;
    vec2 dy = dFdy(vTexCoord) * MIPMAP_PRECISION;

    float texIndex = 0.0; 
    if(gl_FrontFacing) texIndex = 1.0;

    vec4 texColor = textureGrad(uTextureMap, vec3(vTexCoord, texIndex), dx, dy);

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

uniform mediump sampler2DArray uTextureMap;

out vec4 outColor;

const float MIPMAP_PRECISION = 0.8;

void main() {
    vec2 dx = dFdx(vTexCoord) * MIPMAP_PRECISION;
    vec2 dy = dFdx(vTexCoord) * MIPMAP_PRECISION;

    vec4 texColor = textureGrad(uTextureMap, vec3(vTexCoord, 0.0), dx, dy);
    
    if(texColor.a < 0.1) discard;
    outColor = texColor;
}
`