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
precision highp float;
out vec4 outColor;

in vec2 vTexCoord;

uniform sampler2D uTextureMap;

void main() {
    vec2 texUV = vTexCoord;
    if(gl_FrontFacing) {
        texUV.x *= 0.5;
    } else {
        texUV.x = 1.0 - (vTexCoord.x * 0.5);    
    }

    vec4 texColor = texture(uTextureMap, texUV);
    if(texColor.a < 0.4) discard;

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

precision highp float;

in vec2 vTexCoord;

uniform sampler2D uTextureMap;

out vec4 outColor;

void main() {
    vec4 texColor = texture(uTextureMap, vTexCoord);
    if(texColor.a < 0.1) discard;

    outColor = texColor;
}
`