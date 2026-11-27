// The stage: what plays a creature's morph and dance in a web page, shared by the app and the
// player. Use it from its sources (the app and the player point Vite at src/), because the build
// worker is started from build.worker.ts.

export { FrameBuilder, type Built } from "./builder.js";
export {
  breedable,
  buildCreature,
  checkText,
  familyOf,
  fromProgram,
  type Creature,
} from "./creature.js";
export { DanceFloor, type DanceFrame } from "./dance.js";
export { drawFieldsInWorkers } from "./fields.js";
export { Morpher, morphAt, type MorphFrame } from "./morph.js";
export { songLook } from "./songlook.js";
