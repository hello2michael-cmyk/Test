// All ready-made 3D explanation scenes, by id: maths, German, biology, informatics, history and foreign languages.
import { SCENES as MATH } from './mathscenes.js';
import { MATH2_SCENES } from './mathscenes2.js';
import { LANG_SCENES } from './langscenes.js';
import { BIO_SCENES } from './bioscenes.js';
import { INFO_SCENES } from './infoscenes.js';
import { HIST_SCENES } from './histscenes.js';
import { FOREIGN_SCENES } from './fremdsprachen.js';
import { FR6_SCENES } from './fr6scenes.js';
export const SCENES = { ...MATH, ...MATH2_SCENES, ...LANG_SCENES, ...BIO_SCENES, ...INFO_SCENES, ...HIST_SCENES, ...FOREIGN_SCENES, ...FR6_SCENES };
