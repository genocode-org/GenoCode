// Shows creatures in the browser with three.js: one instanced mesh per kind of shape and texture,
// with each shape's colour, alpha, shine, sharpness and sheen carried per instance. `CreatureView`
// is the full, interactive view; `Thumbnails` draws many small pictures with one renderer.
//
// Textures are wrapped onto shapes from three sides at once (triplanar mapping): the picture is
// projected along each axis of the shape and blended by which way the surface faces, so there are
// no seams or pinched poles, and every shape wears its texture the same way.

import {
  toRgb,
  type LaidShape,
  type PathStep,
  type Pattern,
  type ShapeName,
  type Value,
} from "@genocode/core";
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector2,
  WebGLRenderer,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { creatureBounds, shapeGeometry, type Detail } from "./geometry.js";
import {
  backgroundRamp,
  FIELD_OF_VIEW,
  frameCamera,
  LIGHTS,
  type CameraPlacement,
  type Side,
} from "./look.js";
import { PathOverlay } from "./path.js";
import { strokeMesh, type StrokeMesh } from "./stroke.js";
import {
  fieldKey,
  onFieldReady,
  patternMiddle,
  patternSheen,
  readyPixels,
  textureKey,
} from "./texture.js";

/** How big a pattern background is, in pixels along each side. */
const BACKGROUND_SIZE = 512;

/** How long, in seconds, a shape's old picture takes to fade into its new one. */
const FADE_TIME = 1.5;

/** How far a worn texture leans towards the shape's own colour (docs/LANGUAGE.md section 14). */
const HINT = 0.2;

/**
 * Adds per-instance shine (x), sharpness (y), alpha (z) and sheen (w) to the Phong material, and
 * how much of its texture each shape wears. The sheen is a texture finish's white glow at the
 * edges, where the surface turns away from the eye. A worn texture shows its own colours with a
 * hint of the shape's, blended with the plain colour by the wear; while its picture changes, the
 * old one fades into the new.
 */
function addInstanceLook(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        "attribute vec4 instanceLook;",
        "attribute float instanceWear;",
        "varying vec4 vLook;",
        "varying float vWear;",
      ].join("\n"),
    )
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vShapePosition;\nvarying vec3 vShapeNormal;",
    )
    .replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "vLook = instanceLook;",
        "vWear = instanceWear;",
        "vShapePosition = position;",
        "vShapeNormal = normal;",
      ].join("\n"),
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        "varying vec4 vLook;",
        "varying float vWear;",
        "varying vec3 vShapePosition;",
        "varying vec3 vShapeNormal;",
        "#ifdef USE_MAP",
        "uniform sampler2D previousMap;",
        "uniform float previousOn;",
        "uniform float fade;",
        // The shape fits a 1×1×1 box about its middle, so each projection covers it once.
        "vec3 triplanar( sampler2D picture ) {",
        "  vec3 facing = pow( abs( normalize( vShapeNormal ) ), vec3( 4.0 ) );",
        "  facing /= facing.x + facing.y + facing.z;",
        "  vec3 p = vShapePosition + 0.5;",
        "  return texture2D( picture, p.yz ).rgb * facing.x + texture2D( picture, p.xz ).rgb * facing.y",
        "    + texture2D( picture, p.xy ).rgb * facing.z;",
        "}",
        "#endif",
      ].join("\n"),
    )
    .replace("#include <map_fragment>", "")
    .replace(
      "#include <color_fragment>",
      [
        "#include <color_fragment>",
        "#ifdef USE_MAP",
        "vec3 plain = diffuseColor.rgb;",
        "vec3 hint = mix( vec3( 1.0 ), plain / max( max( plain.r, max( plain.g, plain.b ) ), 0.05 ), " +
          HINT.toFixed(2) +
          " );",
        "vec3 worn = triplanar( map ) * hint;",
        "if ( previousOn > 0.5 ) worn = mix( triplanar( previousMap ) * hint, worn, smoothstep( 0.0, 1.0, fade ) );",
        "diffuseColor.rgb = mix( plain, worn, vWear );",
        "#endif",
        "diffuseColor.a *= vLook.z;",
      ].join("\n"),
    )
    .replace(
      "#include <opaque_fragment>",
      [
        "float edge = 1.0 - abs( dot( normal, normalize( vViewPosition ) ) );",
        "outgoingLight += vec3( vLook.w * 0.5 * pow( edge, 3.0 ) );",
        "#include <opaque_fragment>",
      ].join("\n"),
    )
    .replace(
      "#include <lights_phong_fragment>",
      [
        "BlinnPhongMaterial material;",
        "material.diffuseColor = diffuseColor.rgb;",
        "material.specularColor = vec3( vLook.x );",
        "material.specularShininess = 4.0 + vLook.y * 124.0;",
        "material.specularStrength = 1.0;",
      ].join("\n"),
    );
}

/** A shape's texture, unless it wears none of it. */
function wornTexture(s: LaidShape): Pattern | null {
  return s.wear > 0 ? s.texture : null;
}

/** A picture for a fade's empty side. */
const NOTHING = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
NOTHING.needsUpdate = true;

/** A material's fade from an old picture into its own: each material has its own. */
interface Fade {
  previousMap: { value: Texture };
  previousOn: { value: number };
  fade: { value: number };
}

/**
 * A material for shapes, or with `vertexColors` for strokes, whose colour and look are carried by
 * each corner rather than by each shape.
 */
function makeMaterial(
  transparent: boolean,
  map?: Texture,
  vertexColors = false,
): MeshPhongMaterial {
  const material = new MeshPhongMaterial({
    color: 0xffffff,
    transparent,
    depthWrite: !transparent,
    map: map ?? null,
    vertexColors,
  });
  const fade: Fade = {
    previousMap: { value: NOTHING },
    previousOn: { value: 0 },
    fade: { value: 1 },
  };
  material.userData["fade"] = fade;
  // three runs this once for each material, so each keeps its own fade while sharing the program.
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fade);
    addInstanceLook(shader);
  };
  // Keeps three from sharing the compiled program with plain Phong materials.
  material.customProgramCacheKey = () => "genocode-instance-look";
  return material;
}

/** A texture made from a pattern's picture, which can be recoloured in place. */
function patternTexture(pixels: Uint8ClampedArray<ArrayBuffer>, size: number): DataTexture {
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

/** A one-pixel texture of a pattern's middle colour, worn until its picture is ready. */
function standInTexture(p: Pattern): DataTexture {
  const [r, g, b] = patternMiddle(p);
  return patternTexture(new Uint8ClampedArray([r * 255, g * 255, b * 255, 255]), 1);
}

/**
 * A material for shapes wearing one texture, and the picture it shows: `field` is undefined for
 * a stand-in, which is never recoloured. While it fades in, `previous` is the picture it fades
 * from and when the fade began.
 */
interface Textured {
  material: MeshPhongMaterial;
  texture: DataTexture;
  field: string | undefined;
  previous?: { texture: DataTexture; since: number } | undefined;
}

/** An sRGB colour channel (0 to 1) as the linear light three blends colours in. */
function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Strokes' tubes as one geometry, in world space, with each corner's colour and look; `fade`
 * multiplies their see-through.
 */
function strokeGeometry(meshes: readonly StrokeMesh[], fade: number): BufferGeometry {
  let corners = 0;
  let triangles = 0;
  for (const m of meshes) {
    corners += m.position.length / 3;
    triangles += m.index.length;
  }
  const position = new Float32Array(corners * 3);
  const normal = new Float32Array(corners * 3);
  const colour = new Float32Array(corners * 3);
  const look = new Float32Array(corners * 4);
  const index = new Uint32Array(triangles);
  let c = 0;
  let t = 0;
  for (const m of meshes) {
    position.set(m.position, c * 3);
    normal.set(m.normal, c * 3);
    for (let i = 0; i < m.colour.length; i++) colour[c * 3 + i] = linear(m.colour[i]!);
    look.set(m.look, c * 4);
    for (let i = 0; i < m.look.length; i += 4) look[c * 4 + i + 2]! *= fade;
    for (let i = 0; i < m.index.length; i++) index[t + i] = m.index[i]! + c;
    c += m.position.length / 3;
    t += m.index.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(position, 3));
  g.setAttribute("normal", new BufferAttribute(normal, 3));
  g.setAttribute("color", new BufferAttribute(colour, 3));
  // The same names the shapes' per-instance look has, here given per corner.
  g.setAttribute("instanceLook", new BufferAttribute(look, 4));
  g.setAttribute("instanceWear", new BufferAttribute(new Float32Array(corners), 1));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

/** How see-through the shapes are while the turtle's path is drawn over them: their alpha's share. */
const FADED = 0.25;

/** How much of the way to the camera a dance's zoom can bring the creature. */
const NEAREST = 0.75;

/** Light strengths in three are scaled by π compared with the software renderer's. */
const LIGHT_SCALE = Math.PI;

/** The scene both views draw: lights, the creature's shapes and the background. */
class CreatureScene {
  readonly scene = new Scene();
  /** Whether a shape's new picture fades in; small pictures, such as thumbnails, just switch. */
  fades = true;
  private readonly creature = new Group();
  private readonly opaque = makeMaterial(false);
  private readonly seeThrough = makeMaterial(true);
  private readonly opaqueStrokes = makeMaterial(false, undefined, true);
  private readonly seeThroughStrokes = makeMaterial(true, undefined, true);
  /** The textured materials in use, by texture and whether they're see-through. */
  private textured = new Map<string, Textured>();
  /**
   * What each textured group of shapes wore last time, so while a new picture is drawn the shapes
   * keep the one they had, as a dance or morph moves on. A group is known by its kind of shape and
   * its place among the groups of that kind.
   */
  private worn = new Map<string, Textured>();
  /** The background asked for last, to show again once its picture is ready. */
  fill: Value | undefined;
  /** The pattern background, kept so a new hue only recolours it. */
  private backgroundPattern: { texture: DataTexture; field: string; look: string } | undefined;
  private aspect = 1;
  shapes: readonly LaidShape[] = [];
  /** The creature's focus point, if it has one: where the camera looks. */
  focus: readonly [number, number, number] | undefined;
  private readonly lights: { light: DirectionalLight; direction: Vector3 }[] = [];
  /** The turtle's path, drawn over the creature when asked for. */
  readonly path = new PathOverlay();
  /** The shapes are drawn faded, so the path shows through them. */
  faded = false;

  constructor() {
    this.scene.add(this.creature);
    this.scene.add(this.path.group);
    this.scene.add(new AmbientLight(0xffffff, LIGHTS.ambient * LIGHT_SCALE));
    for (const l of [LIGHTS.key, LIGHTS.fill]) {
      const light = new DirectionalLight(0xffffff, l.strength * LIGHT_SCALE);
      light.position.set(...l.direction);
      this.scene.add(light);
      this.lights.push({ light, direction: new Vector3(...l.direction) });
    }
    this.setBackground(undefined);
  }

  /** Turns the creature as a whole by `turn` and moves it by `offset`, as a dance does. */
  pose(turn: Quaternion, offset: Vector3): void {
    this.creature.quaternion.copy(turn);
    this.creature.position.copy(offset);
    this.path.group.quaternion.copy(turn);
    this.path.group.position.copy(offset);
  }

  /** Turns the lights with the camera, by `turn`, so every side is lit as the front is. */
  turnLights(turn: Quaternion): void {
    for (const { light, direction } of this.lights) {
      light.position.copy(direction).applyQuaternion(turn);
    }
  }

  setCreature(
    shapes: readonly LaidShape[],
    detail: Detail,
    focus?: readonly [number, number, number],
  ): void {
    for (const child of [...this.creature.children]) {
      this.creature.remove(child);
      const mesh = child as Mesh;
      mesh.geometry.dispose(); // each mesh has its own copy, carrying its instance attributes
      if (mesh instanceof InstancedMesh) mesh.dispose();
    }
    this.shapes = shapes;
    this.focus = focus;
    const groups = new Map<string, LaidShape[]>();
    const strokes: { mesh: StrokeMesh; seeThrough: boolean }[] = [];
    for (const s of shapes) {
      if (s.shape === "stroke") {
        const mesh = s.points && strokeMesh(s.points, detail);
        const alphas = s.points?.map((p) => p.colour.a) ?? [];
        if (mesh && alphas.some((a) => a > 0)) {
          strokes.push({ mesh, seeThrough: this.faded || alphas.some((a) => a < 0.999) });
        }
        continue;
      }
      if (s.colour.a <= 0) continue;
      const t = wornTexture(s);
      const seeThrough = this.faded || s.colour.a < 0.999;
      const key = `${s.shape}|${s.mirrored}|${seeThrough}|${t ? textureKey(t) : ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const old = this.textured;
    const wornBefore = this.worn;
    this.textured = new Map();
    this.worn = new Map();
    const places = new Map<string, number>();
    const matrix = new Matrix4();
    const colour = new Color();
    for (const [key, members] of groups) {
      const [shape, mirrored, transparent] = key.split("|");
      const seeThrough = transparent === "true";
      const pattern = wornTexture(members[0]!);
      let material = seeThrough ? this.seeThrough : this.opaque;
      if (pattern) {
        const kind = `${shape}|${mirrored}|${transparent}`;
        const place = places.get(kind) ?? 0;
        places.set(kind, place + 1);
        const slot = `${kind}#${place}`;
        const t = this.texturedMaterial(pattern, seeThrough, old, wornBefore.get(slot));
        this.worn.set(slot, t);
        material = t.material;
      }
      const sheen = pattern ? patternSheen(pattern) : 0;
      const wear = new Float32Array(members.map((s) => s.wear));
      const mesh = new InstancedMesh(
        shapeGeometry(shape as ShapeName, mirrored === "true", detail),
        material,
        members.length,
      );
      const look = new Float32Array(members.length * 4);
      members.forEach((s, i) => {
        matrix.fromArray(s.matrix);
        mesh.setMatrixAt(i, matrix);
        const [r, g, b] = toRgb(s.colour);
        mesh.setColorAt(i, colour.setRGB(r, g, b, SRGBColorSpace));
        look[i * 4] = s.shine;
        look[i * 4 + 1] = s.sharpness;
        look[i * 4 + 2] = s.colour.a * (this.faded ? FADED : 1);
        // The finish's sheen comes and goes with the texture.
        look[i * 4 + 3] = sheen * s.wear;
      });
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setAttribute("instanceLook", new InstancedBufferAttribute(look, 4));
      mesh.geometry.setAttribute("instanceWear", new InstancedBufferAttribute(wear, 1));
      mesh.computeBoundingSphere();
      this.creature.add(mesh);
    }
    for (const seeThrough of [false, true]) {
      const these = strokes.filter((s) => s.seeThrough === seeThrough).map((s) => s.mesh);
      if (these.length === 0) continue;
      this.creature.add(
        new Mesh(
          strokeGeometry(these, this.faded ? FADED : 1),
          seeThrough ? this.seeThroughStrokes : this.opaqueStrokes,
        ),
      );
    }
    const kept = new Set(this.textured.values());
    for (const t of old.values()) {
      if (kept.has(t)) continue;
      t.material.dispose();
      if (!this.showing(t.texture)) t.texture.dispose();
      if (t.previous && !this.showing(t.previous.texture)) t.previous.texture.dispose();
    }
    this.stepFades();
  }

  /** Whether a picture is on show, in a material or as the one a material fades from. */
  private showing(texture: DataTexture): boolean {
    for (const t of this.textured.values()) {
      if (t.texture === texture || t.previous?.texture === texture) return true;
    }
    return false;
  }

  /** Moves every fade on to now. Says whether any is still going. */
  stepFades(now = performance.now()): boolean {
    let going = false;
    for (const t of new Set(this.textured.values())) {
      const fade = t.material.userData["fade"] as Fade;
      const p = t.previous;
      if (p === undefined) continue;
      const f = (now - p.since) / 1000 / FADE_TIME;
      if (f >= 1) {
        t.previous = undefined;
        if (!this.showing(p.texture)) p.texture.dispose();
        fade.previousMap.value = NOTHING;
        fade.previousOn.value = 0;
        fade.fade.value = 1;
      } else {
        fade.previousMap.value = p.texture;
        fade.previousOn.value = 1;
        fade.fade.value = f;
        going = true;
      }
    }
    return going;
  }

  /**
   * The material for shapes wearing `p`: the one already in use; or one left over from the last
   * creature with the same picture, recoloured (so a hue that follows the music costs little); or
   * a new one. While the picture is being drawn, the shapes keep what they wore (`worn`), or wear
   * the palette's middle colour.
   */
  private texturedMaterial(
    p: Pattern,
    seeThrough: boolean,
    old: Map<string, Textured>,
    worn: Textured | undefined,
  ): Textured {
    const key = `${textureKey(p)}|${seeThrough}`;
    const field = `${fieldKey(p)}|${seeThrough}`;
    let t = this.textured.get(key) ?? old.get(key);
    if (t === undefined || t.field === undefined) {
      const pixels = readyPixels(p);
      if (pixels === undefined) {
        if (worn) {
          t = worn;
        } else {
          const texture = standInTexture(p);
          t = { material: makeMaterial(seeThrough, texture), texture, field: undefined };
        }
        // Kept under its own name, so it isn't taken for the real picture later.
        this.textured.set(`waiting|${key}|${this.textured.size}`, t);
        return t;
      }
      t = [...old.values()].find((c) => c.field === field && !this.inUse(c));
      if (t) {
        (t.texture.image.data as Uint8ClampedArray).set(pixels);
        t.texture.needsUpdate = true;
      } else {
        const texture = patternTexture(pixels, Math.sqrt(pixels.length / 4));
        t = { material: makeMaterial(seeThrough, texture), texture, field };
        // A new picture for these shapes: the one they wore fades into it.
        if (this.fades && worn && worn.texture !== texture) {
          t.previous = { texture: worn.texture, since: performance.now() };
        }
      }
    }
    this.textured.set(key, t);
    return t;
  }

  private inUse(t: Textured): boolean {
    for (const v of this.textured.values()) if (v === t) return true;
    return false;
  }

  /** A background's fill: a colour, a gradient or a pattern. */
  setBackground(fill: Value | undefined): void {
    this.fill = fill;
    if (typeof fill === "object" && fill.type === "pattern" && fill.kind !== null) {
      this.setPatternBackground(fill);
      return;
    }
    this.backgroundPattern = undefined;
    const rows = 256;
    const ramp = backgroundRamp(fill, rows);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = rows;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(1, rows);
    ramp.forEach((c, i) => {
      const row = rows - 1 - i;
      image.data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], row * 4);
    });
    ctx.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const old = this.scene.background;
    this.scene.background = texture;
    if (old && "dispose" in old) old.dispose();
  }

  /** Shows a pattern behind the creature, recolouring the one on show if it's the same picture. */
  private setPatternBackground(p: Pattern): void {
    const field = fieldKey(p, BACKGROUND_SIZE);
    const look = textureKey(p, BACKGROUND_SIZE);
    const shown = this.backgroundPattern;
    if (shown && shown.field === field && shown.look === look) return;
    // While the picture is drawn, the background stays as it was.
    const pixels = readyPixels(p, BACKGROUND_SIZE);
    if (pixels === undefined) return;
    if (shown && shown.field === field && this.scene.background === shown.texture) {
      (shown.texture.image.data as Uint8ClampedArray).set(pixels);
      shown.texture.needsUpdate = true;
      shown.look = look;
      return;
    }
    const texture = patternTexture(pixels, BACKGROUND_SIZE);
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter;
    const old = this.scene.background;
    this.scene.background = texture;
    if (old && "dispose" in old) old.dispose();
    this.backgroundPattern = { texture, field, look };
    this.coverBackground();
  }

  /** The view's width over its height, so a pattern background covers it without stretching. */
  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.coverBackground();
  }

  /** Fits a square pattern background to cover the view, cutting off what's left over. */
  private coverBackground(): void {
    const texture = this.backgroundPattern?.texture;
    if (!texture) return;
    const a = this.aspect;
    texture.repeat.set(a > 1 ? 1 : a, a > 1 ? 1 / a : 1);
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
  }

  /**
   * Points the camera at the whole creature, from the front and a little above; or at `around`,
   * other shapes than the ones on show.
   */
  frame(
    camera: PerspectiveCamera,
    aspect: number,
    side?: Side,
    around: Around = { shapes: this.shapes, focus: this.focus },
  ): CameraPlacement {
    this.aspect = aspect;
    this.coverBackground();
    const placement = frameCamera(creatureBounds(around.shapes, around.focus), aspect, side);
    camera.position.set(...placement.position);
    camera.near = placement.near / 4;
    camera.far = placement.far * 4;
    camera.aspect = aspect;
    camera.lookAt(...placement.target);
    camera.updateProjectionMatrix();
    return placement;
  }

  dispose(): void {
    this.setCreature([], "low");
    this.path.dispose();
    const background = this.scene.background;
    if (background && "dispose" in background) background.dispose();
    this.opaque.dispose();
    this.seeThrough.dispose();
    this.opaqueStrokes.dispose();
    this.seeThroughStrokes.dispose();
  }
}

/** Shapes to frame the camera on, with their focus point if they have one. */
export interface Around {
  shapes: readonly LaidShape[];
  focus?: readonly [number, number, number] | undefined;
}

export class CreatureView {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1000);
  private readonly look = new CreatureScene();
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private frameRequested = false;
  /** The camera's turn in the front view, which the lights are set for. */
  private readonly frontTurn = new Quaternion();
  private readonly stopListening: () => void;
  private readonly ray = new Raycaster();
  private hovered: PathStep | undefined;
  /** Where the pointer went down, to tell a click from a drag of the camera. */
  private downAt: { x: number; y: number } | undefined;
  /** Called when the pointer moves onto a step of the path, or off the path (undefined). */
  onPathHover: ((step: PathStep | undefined) => void) | undefined;
  /** Called when a step of the path is clicked. */
  onPathClick: ((step: PathStep) => void) | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.requestFrame());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    // A texture's picture drawn elsewhere is ready: show it.
    this.stopListening = onFieldReady(() => {
      this.look.setCreature(this.look.shapes, "high", this.look.focus);
      this.look.setBackground(this.look.fill);
      this.requestFrame();
    });
  }

  /**
   * Replaces the creature on show. With `keepView`, the camera stays where the viewer left it.
   * With `"unless-inside"`, it stays too, unless the new creature has grown round it, such as a much
   * bigger one pasted over a small one, which would show nothing from inside: that's framed afresh.
   * A camera zoomed in on purpose stays. Morphing and dancing keep the camera whatever the creature
   * does. `focus` is the creature's focus point, if it has one: where the camera looks.
   */
  setCreature(
    shapes: readonly LaidShape[],
    keepView: boolean | "unless-inside" = false,
    focus?: readonly [number, number, number],
  ): void {
    const wasInside = this.cameraInside(this.look.shapes, this.look.focus);
    this.look.setCreature(shapes, "high", focus);
    const swallowed =
      keepView === "unless-inside" && !wasInside && this.cameraInside(shapes, focus);
    if (!keepView || swallowed) this.resetView();
    this.requestFrame();
  }

  /**
   * Draws the turtle's path over the creature, with the shapes faded so it shows through; without
   * one, shows the creature as usual. Call it after `setCreature`, with the path of the same build.
   */
  setPath(path: readonly PathStep[] | undefined): void {
    const faded = path !== undefined;
    if (faded !== this.look.faded) {
      this.look.faded = faded;
      this.look.setCreature(this.look.shapes, "high", this.look.focus);
    }
    const { radius } = creatureBounds(this.look.shapes, this.look.focus);
    this.look.path.set(path, radius > 0 ? radius : 1);
    if (!faded) this.hover(undefined);
    this.requestFrame();
  }

  /** Lights up the steps of the path for which `which` is true; undefined lights none up. */
  highlightPath(which: ((step: PathStep) => boolean) | undefined): void {
    this.look.path.highlight(which);
    this.requestFrame();
  }

  private readonly pointerMove = (e: PointerEvent): void => {
    // While a button is down the camera is being moved, not the path looked at.
    if (e.buttons !== 0 || !this.look.faded) return;
    this.hover(this.stepAt(e));
  };

  private readonly pointerDown = (e: PointerEvent): void => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private readonly pointerUp = (e: PointerEvent): void => {
    const d = this.downAt;
    this.downAt = undefined;
    if (!d || !this.look.faded || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const step = this.stepAt(e);
    if (step) this.onPathClick?.(step);
  };

  private readonly pointerLeave = (): void => this.hover(undefined);

  private hover(step: PathStep | undefined): void {
    if (step === this.hovered) return;
    this.hovered = step;
    this.canvas.style.cursor = step ? "pointer" : "";
    this.onPathHover?.(step);
  }

  /** The step of the path under the pointer, if any. */
  private stepAt(e: PointerEvent): PathStep | undefined {
    const box = this.canvas.getBoundingClientRect();
    const at = new Vector2(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    );
    this.ray.setFromCamera(at, this.camera);
    // About 6 pixels either side, at the distance the camera looks at.
    const distance = this.camera.position.distanceTo(this.controls.target);
    const across = 2 * distance * Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.ray.params.Line = { threshold: (across / Math.max(1, box.height)) * 6 };
    return this.look.path.pick(this.ray);
  }

  /** Whether the camera is within these shapes' bounds. */
  private cameraInside(
    shapes: readonly LaidShape[],
    focus: readonly [number, number, number] | undefined,
  ): boolean {
    if (shapes.length === 0) return false;
    const { centre, radius } = creatureBounds(shapes, focus);
    return this.camera.position.distanceTo(new Vector3(...centre)) < radius;
  }

  /** Shows a background's fill: a colour, a gradient or a pattern. */
  setBackground(fill: Value | undefined): void {
    this.look.setBackground(fill);
    this.requestFrame();
  }

  /** Frames the whole creature, seen from the front and a little above. */
  resetView(): void {
    this.viewFrom(undefined);
  }

  /**
   * Frames the whole creature, seen straight on from one side; without one, as `resetView`. With
   * `around`, it frames those shapes instead of the ones on show: morphing and dancing frame the
   * first creature of the loop, whichever is on show, so the others are seen at the same size.
   */
  viewFrom(side: Side | undefined, around?: Around): void {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    if (side !== undefined) {
      // The lights are set for the front view, so note where that is first.
      this.look.frame(this.camera, aspect, undefined, around);
      this.frontTurn.copy(this.camera.quaternion);
    }
    const placement = this.look.frame(this.camera, aspect, side, around);
    if (side === undefined) this.frontTurn.copy(this.camera.quaternion);
    this.controls.target.set(...placement.target);
    this.controls.minDistance = 0;
    this.controls.maxDistance =
      new Vector3(...placement.position).distanceTo(this.controls.target) * 8;
    this.controls.update();
    this.requestFrame();
  }

  /** Stops the viewer turning, moving and zooming the camera with the mouse, or lets them again. */
  lockCamera(locked: boolean): void {
    this.controls.enabled = !locked;
  }

  /**
   * Turns the creature as a whole about its middle (`turn` is a quaternion: x, y, z, w) and brings
   * it `nearness` of the way (0 to 1) towards the camera, as a dance does. The camera stays put, so
   * the viewer can still look round.
   */
  setPose(turn: readonly [number, number, number, number], nearness = 0): void {
    const q = new Quaternion(...turn);
    const middle = this.controls.target;
    const towardsCamera = this.camera.position.clone().sub(middle);
    const offset = middle
      .clone()
      .sub(middle.clone().applyQuaternion(q))
      .addScaledVector(towardsCamera, NEAREST * Math.min(Math.max(nearness, 0), 1));
    this.look.pose(q, offset);
    this.requestFrame();
  }

  /**
   * Draws `ratio` pixels for each pixel of the canvas as shown, as when filming it at a set size;
   * without one, as many as the screen has.
   */
  setPixelRatio(ratio?: number): void {
    this.renderer.setPixelRatio(ratio ?? window.devicePixelRatio);
    this.resize();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.look.setAspect(w / h);
    this.camera.updateProjectionMatrix();
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      // Damping keeps the view moving for a moment after the mouse lets go, and a fading picture
      // keeps it drawing until the fade is done.
      if (this.controls.update()) this.requestFrame();
      if (this.look.stepFades()) this.requestFrame();
      this.draw();
    });
  }

  private draw(): void {
    this.look.turnLights(this.camera.quaternion.clone().multiply(this.frontTurn.clone().invert()));
    this.renderer.render(this.look.scene, this.camera);
  }

  /** The view as it is now, as a PNG picture `scale` times as big as it's shown. */
  picture(scale = 2): Promise<Blob | null> {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
    this.draw();
    return new Promise((resolve) =>
      this.canvas.toBlob((blob) => {
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(w, h, false);
        this.requestFrame();
        resolve(blob);
      }, "image/png"),
    );
  }

  dispose(): void {
    this.stopListening();
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointerleave", this.pointerLeave);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.look.dispose();
    this.renderer.dispose();
  }
}

/**
 * Draws creatures into small 2D canvases, such as the tiles of a breeding grid, with one shared
 * WebGL renderer: browsers only allow a few WebGL canvases at once. Shapes are drawn with less
 * detail than in `CreatureView`, which is plenty at tile size and much quicker.
 */
export class Thumbnails {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1000);
  private readonly look = new CreatureScene();

  constructor() {
    this.look.fades = false;
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  }

  /**
   * Draws a creature and its background to fill `target`, at the target's own pixel size, looking
   * at its focus point if it has one.
   */
  draw(
    target: HTMLCanvasElement,
    shapes: readonly LaidShape[],
    background: Value | undefined,
    focus?: readonly [number, number, number],
  ): void {
    const w = target.width;
    const h = target.height;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.look.setCreature(shapes, "low", focus);
    this.look.setBackground(background);
    this.look.frame(this.camera, w / h);
    this.renderer.render(this.look.scene, this.camera);
    const ctx = target.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.renderer.domElement, 0, 0, w, h);
  }

  dispose(): void {
    this.look.dispose();
    this.renderer.dispose();
  }
}
