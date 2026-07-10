import { Vector3 } from './utils/wglm-classes.js'

// TODO: Create quad and circle vertices
export const QUAD_VERTICES = [
   // Pos           // TexCoords
  -0.5, -0.7, 0.0,  0.0, 1.0,   // bottom left
   0.5, -0.7, 0.0,  1.0, 1.0,   // bottom right
  -0.5,  0.7, 0.0,  0.0, 0.0,   // top    left
   0.5,  0.7, 0.0,  1.0, 0.0    // top    right
];
export const CIRCLE_VERTICES = []

export const QUAD_INDICES = [
    0, 1, 2,
    1, 3, 2
]

export const BACKGROUND_COLOR = [1, 1, 1, 0]

export const CAMERA_POSITION = new Vector3(0, 0, 0);
export const CAMERA_YAW = -90;
export const CAMERA_PITCH = 0;

export const CAMERA_ZOOM = 45;