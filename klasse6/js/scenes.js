// All ready-made 3D explanation scenes, by id. Maths scenes plus language and biology scenes.
import { SCENES as MATH } from './mathscenes.js';
import { LANG_SCENES } from './langscenes.js';
import { BIO_SCENES } from './bioscenes.js';
export const SCENES = { ...MATH, ...LANG_SCENES, ...BIO_SCENES };
