import { OBJ } from '../../settings.js';
import { Vector3 } from '../../utils/wglm-classes.js';
import { easeInOutCurve, easeOutBackCurve } from '../../utils/wlgm-animation-curves.js';

import RenderableObject from '../../view/renderableObject.js';

export default class Card extends RenderableObject {
    typeIdx = 0;

    ogPos;

    constructor(typeIdx, initPos, initRotation, initScale = OBJ.card.scale) {
        super("card", initPos, initRotation, initScale);
        this.typeIdx = typeIdx;
        this.ogPos = initPos.clone();
    }

    update(dt) {
        super.update(dt);
    }

    onMouseEnter(point) {
        this.animator.positionAnimation({
            to: Vector3.add(this.position, new Vector3(0, 0.1, -0.06)),
            animTime: 0.2,
            animCurve: easeOutBackCurve
        })
    }

    onMouseExit() {
        this.animator.positionAnimation({
            to: this.ogPos,
            animTime: 0.2,
            animCurve: easeOutBackCurve
        })
    }
}