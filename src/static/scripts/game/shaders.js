// QUAD or CARD shader?
export const QUAD_VERTEX_SHADER = `#version 300 es

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

export const QUAD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 outColor;

in vec2 vTexCoord;

uniform sampler2D uTextureMap;

void main() {
    outColor = texture(uTextureMap, vTexCoord);
}
`

// CIRCLE or COIN shader?
export const CIRCLE_VERTEX_SHADER = `#version 300 es

layout(location = 0) in vec3 aPosition; 

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

void main() {
    gl_Position = projection * view * model * vec4(aPosition, 1.0);
}
`

export const CIRCLE_FRAGMENT_SHADER = `#version 300 es

precision highp float;

out vec4 outColor;

void main() {
    outColor = vec4(1, 0, 0, 1);
}
`