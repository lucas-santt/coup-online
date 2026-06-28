import Shader from './shader.js'

export default class Material {
    shader;

    constructor(gl, vertexSource, fragmentSource) {
        this.shader = new Shader(gl, vertexSource, fragmentSource);
    }
}