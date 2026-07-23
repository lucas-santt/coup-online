import { ANIM, OBJ } from '../../settings.js';
import { Vector3 } from '../../utils/wglm-classes.js';

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
            to: Vector3.add(this.position, ANIM.userCard.hover.positionOffset),
            ...ANIM.userCard.hover.animSettings
        })
    }

    onMouseExit() {
        this.animator.positionAnimation({
            to: this.ogPos,
            ...ANIM.userCard.hover.animSettings
        })
    }
}