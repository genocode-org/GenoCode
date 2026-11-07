// Draws GenoCode creatures: in the browser with three.js (CreatureView), or into an image without
// a browser (rasterize), with the same shapes, camera and lights, and the textures and pattern
// backgrounds made from patterns.

export { creatureBounds, shapeGeometry, type Bounds, type Detail } from "./geometry.js";
export {
  backgroundRamp,
  DEFAULT_BACKGROUND,
  FIELD_OF_VIEW,
  frameCamera,
  LIGHTS,
  type CameraPlacement,
  type Side,
  type View,
} from "./look.js";
export { rasterize, type Image, type RasterOptions } from "./software.js";
export {
  drawFieldsWith,
  hasField,
  onFieldReady,
  patternField,
  patternPalette,
  patternPixels,
  patternSheen,
  pixelsWhenReady,
  TEXTURE_SIZE,
  type FieldDrawer,
} from "./texture.js";
export { drawField, type Field } from "./patterns.js";
export { CreatureView, Thumbnails, type Around } from "./webgl.js";
