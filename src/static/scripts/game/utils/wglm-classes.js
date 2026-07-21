export class Vector2 extends Array{

    constructor(x=0, y=0) {
        super(x, y);
    }

    get x()    { return this[0]; }
    set x(val) { this[0] = val; }

    get y()    { return this[1] }
    set y(val) { this[1] = val; }

    mag() {
        return Math.hypot(this.x, this.y);
    }

    copy(v) {
        this.x = v.x; this.y = v.y;
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    static mult(v, c) {
        return new Vector2(v.x * c, v.y * c);   
    }
}

export class Vector3 extends Array{
    /*
        Could be optimized by not creating a Vector3
            on every return in static functions
    */
    constructor(x=0, y=0, z=0) {
        super(x, y, z);
    }

    get x()    { return this[0]; }
    set x(val) { this[0] = val; }

    get y()    { return this[1] }
    set y(val) { this[1] = val; }

    get z()    { return this[2] }
    set z(val) { this[2] = val; }

    mag() {
        return Math.hypot(this.x, this.y, this.z);
    }

    copy(v) {
        this.x = v.x; this.y = v.y; this.z = v.z;
    }

    clone() {
        return new Vector3(this.x, this.y, this.z);
    }

    static normalize(v) {
        let mag = v.mag();
        if(mag==0) return new Vector3(0.0, 0.0, 0.0);

        return new Vector3(v.x/mag, v.y/mag, v.z/mag);
    }

    static add(v1, v2) {
        return new Vector3(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    }

    static subtract(v1, v2) {
        return new Vector3(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    static mult(v, c) {
        return new Vector3(v.x*c, v.y*c, v.z*c);
    }

    /**
     * Hadmard Multiplication
     *
     * @static
     * @param {Vector3} v1 
     * @param {Vector3} v2 
     * @returns {Vector3} 
     */
    static hadMult(v1, v2) {
        return new Vector3(v1.x * v2.x, v1.y * v2.y, v1.z * v2.z);
    }

    static divide(v, c) {
        if(c==0) return new Vector3(0, 0, 0);
        return new Vector3(v.x/c, v.y/c, v.z/c);
    }

    static cross(v1, v2) {
        return new Vector3(v1.y*v2.z - v1.z*v2.y, v1.z*v2.x - v1.x*v2.z, v1.x*v2.y - v1.y*v2.x);
    }

    static dot(v1, v2) {
        return (v1.x * v2.x) + (v1.y * v2.y) + (v1.z * v2.z);
    }
}

export class Mat4 extends Array{
    constructor(fillVal) {
        super(4);

        for(let i=0; i<4; i++){
            this[i] = new Array(4).fill(fillVal);
        }
    }

    flatten() {
        /* 
            Flatten the matrix into a 1-row matrix
                Since WebGL expects it to be 1-row

            It could be optimized, avoiding overhead, by already
                creating it in a 1-row type thus not needing it
                to be flatten every frame
        */
        return new Float32Array(this.flat());
    } 

    static multVector3(mat, v, w) {
        return new Vector3(
            (v.x * mat[0][0]) + (v.y * mat[1][0]) + (v.z * mat[2][0]) + (w * mat[3][0]),
            (v.x * mat[0][1]) + (v.y * mat[1][1]) + (v.z * mat[2][1]) + (w * mat[3][1]),
            (v.x * mat[0][2]) + (v.y * mat[1][2]) + (v.z * mat[2][2]) + (w * mat[3][2])
        );
    }

    static invertModelMatrix(mat) {
        // Assumes there aren't scale factors involved
        const u = new Vector3(mat[0][0], mat[0][1], mat[0][2]);
        const v = new Vector3(mat[1][0], mat[1][1], mat[1][2]);
        const w = new Vector3(mat[2][0], mat[2][1], mat[2][2]);
        const t = new Vector3(mat[3][0], mat[3][1], mat[3][2]);

        let inverse = new Mat4(0.0);
        inverse[0][0] = u.x;
        inverse[0][1] = v.x;
        inverse[0][2] = w.x;

        inverse[1][0] = u.y;
        inverse[1][1] = v.y;
        inverse[1][2] = w.y;
        
        inverse[2][0] = u.z;
        inverse[2][1] = v.z;
        inverse[2][2] = w.z;

        inverse[3][0] = -Vector3.dot(u, t);
        inverse[3][1] = -Vector3.dot(v, t);
        inverse[3][2] = -Vector3.dot(w, t);
        inverse[3][3] = 1;

        return inverse;
    }
}

export class Ray {
    origin; direction;

    constructor(origin, direction) {
        this.origin = origin;
        this.direction = direction;
    }

    point(t) {
        return Vector3.add(Vector3.mult(this.direction, t), this.origin);
    }
}