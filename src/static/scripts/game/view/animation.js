import { Vector3 } from "../utils/wglm-classes.js";
import { linearCurve } from "../utils/wlgm-animation-curves.js";

class Animator {
    active;

    _animations;
    
    constructor() {
        this._animations = new Map();
    }

    update(dt) {
        if(!this.active) return;

        let runningAnimation = false;
        for(const animation of this._animations.values())
            if(animation.update(dt)) runningAnimation = true;
        this.active = runningAnimation;
    }

    pauseAnimation(name) {
        const anim = this._animations.get(name);
        if(anim) anim.resume();
    }

    resumeAnimation(name) {
        const anim = this._animations.get(name);
        if(anim) anim.resume(); this.active = true;
    }

    stopAnimation(name) {
        const anim = this._animations.get(name);
        if(anim) anim.stop();
    }

    startAnimation(name) {
        const anim = this._animations.get(name);
        if(anim) anim.start(); this.active = true;
    }

    _addAnimation(name, target, config) {
        this.active = true;
        return new Promise((resolve) => {
            this._animations.set(name, new Animation(target, config, resolve));
        });
    }
}

export class ObjectAnimator extends Animator{
    #object; #animations;

    constructor(renderableObject) {
        super();
        this.#object = renderableObject;
    }

    positionAnimation(config) {
        return this._addAnimation("position", this.#object.position, config);   
    }

    rotationAnimation(config) {
        return this._addAnimation("rotation", this.#object.rotation, config);
    }

    scaleAnimation(config) {
        return this._addAnimation("scale", this.#object.scale, config);
    }
}

export class CameraAnimator extends Animator {
    #camera;

    constructor(camera) {
        super();
        this.#camera = camera;
    }

    positionAnimation(config) {
        return this._addAnimation("position", this.#camera.position, config);
    }

    yawAnimation(config) {
        return this._addAnimation("yaw", { obj: this.#camera, prop: "yaw" }, config);
    }

    pitchAnimation(config) {
        return this._addAnimation("pitch", { obj: this.#camera, prop: "pitch" }, config);
    }

    zoomAnimation(config) {
        return this._addAnimation("zoom", { obj: this.#camera, prop: "zoom" }, config);
    }
}

export class Animation {
    active;

    #fullAnimTime; #currAnimTime; #timer;
    #target; #from; #to;
    #animCurve;
    #resolve;

    constructor(target, config, resolve) {
        const { 
            animTime,
            from = null, 
            to, 
            startInstantly = true, 
            animCurve = linearCurve,
        } = config;
        
        this.#fullAnimTime = animTime;
        this.#target = target;

        if(from) this.#from = from;
        else { // If from is null, we get it from current target's value
            if(target instanceof Vector3) this.#from = target.clone();
            else this.#from = target.obj[target.prop];
        }
        
        this.#to = to;
        this.#animCurve = animCurve;

        this.#resolve = resolve;

        if (startInstantly) this.start();
        else this.active = false;
    }

    update(dt) {
        if(!this.active) return false;

        this.#timer += dt;
        const percentage = Math.min(this.#timer / this.#currAnimTime, 1.0);
        
        const currValue = this.#animCurve(this.#from, this.#to, percentage);

        if(this.#target instanceof Vector3) this.#target.copy(currValue);
        else this.#target.obj[this.#target.prop] = currValue;
        
        if(percentage === 1.0) {
            this.#end();
            return false;
        } else return true;
    }

    
    pause() {
        this.active = false;
    }

    resume() {
        this.active = true;
    }

    stop() {
        this.#timer = 0;
        this.active = false;
    }

    start() {
        this.#currAnimTime = this.#fullAnimTime;
        this.#timer = 0;
        this.active = true;
    }
    
    changeAnimationTime(newAnimTime) {
        this.#fullAnimTime = newAnimTime;
        
        if(this.active) {
            const progress = this.#timer / this.#currAnimTime;
            this.#currAnimTime = newAnimTime;
            this.#timer = progress * this.#currAnimTime;
        }
    }

    #end() {
        this.stop();
        if(this.#resolve) this.#resolve();
    }
}