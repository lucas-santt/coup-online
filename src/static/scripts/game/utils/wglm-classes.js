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

    static add(v1, v2) {
        return new Vector3(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    }

    static subtract(v1, v2) {
        return new Vector3(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    static mult(v, c) {
        return new Vector3(v.x*c, v.y*c, v.z*c);
    }

    static divide(v, c) {
        if(c==0) return new Vector3(0, 0, 0);
        return new Vector3(v.x/c, v.y/c, v.z/c);
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
}