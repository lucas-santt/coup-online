import { Vector3, Mat4 } from '../utils/wglm-classes.js'

export default class SceneObject {
    position; scale;

    constructor(initPos, initScale) {
        this.position = initPos;
        this.scale = initScale;
    }

    getModelTransform() {
        const mat = new Mat4(0);

        mat[0][0] = this.scale.x;
        mat[1][1] = this.scale.y;
        mat[2][2] = this.scale.z;

        mat[3][0] = this.position.x;
        mat[3][1] = this.position.y;
        mat[3][2] = this.position.z;
        mat[3][3] = 1;

        return mat.flatten();
    }
}