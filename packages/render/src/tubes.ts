// Strokes' tubes drawn by the graphics card. The rings down each tube are worked out here, as for
// the software renderer (stroke.ts), but turning each ring into its corners, the bulk of the work,
// is left to the vertex shader. Each frame only the rings go to the graphics card, as a texture;
// the corners' mesh says no more than which ring and which way round each corner is, so it's only
// made again when a stroke gains or loses rings.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  type MeshPhongMaterial,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { eachRing, ringCount, type TubeRings } from "./stroke.js";

/** Texels for each ring: middle and rx; along and ry; side and bulge; up and out; colour; look. */
const TEXELS = 6;
/** Texels in a row of the rings' texture: a whole number of rings. */
const ROW = TEXELS * 256;

/** The vertex shader's part: one corner from its ring, as stroke.ts's `ring` makes it. */
const RING_SHADER = /* glsl */ `
uniform highp sampler2D strokeRings;
vec4 ringTexel( int ring, int k ) {
  int i = ring * ${TEXELS} + k;
  return texelFetch( strokeRings, ivec2( i % ${ROW}, i / ${ROW} ), 0 );
}
// An sRGB colour channel (0 to 1) as the linear light three blends colours in.
float linearLight( float c ) {
  return c <= 0.04045 ? c / 12.92 : pow( ( c + 0.055 ) / 1.055, 2.4 );
}`;

const CORNER_SHADER = /* glsl */ `
  int strokeRing = int( position.x + 0.5 );
  float cosine = position.y;
  float sine = position.z;
  vec4 r0 = ringTexel( strokeRing, 0 );
  vec4 r1 = ringTexel( strokeRing, 1 );
  vec4 r2 = ringTexel( strokeRing, 2 );
  vec4 r3 = ringTexel( strokeRing, 3 );
  vec4 strokeColour = ringTexel( strokeRing, 4 );
  vec4 r5 = ringTexel( strokeRing, 5 );
  vec3 ringAt = r0.xyz;
  float rx = r0.w;
  vec3 ringAlong = r1.xyz;
  float ry = r1.w;
  vec3 ringSide = r2.xyz;
  float bulge = r2.w;
  vec3 ringUp = r3.xyz;
  float outward = r3.w;
  float shrink = sqrt( max( 0.0, 1.0 - bulge * bulge ) );
  float reach = min( rx, ry ) * bulge * outward;
  vec3 strokePosition = ringAt + ringAlong * reach
    + ( ringSide * ( rx * shrink * cosine ) + ringUp * ( ry * shrink * sine ) );
  // The ellipse's outward direction, tipping along the tube on the rounded ends.
  vec3 tipped = ringSide * ( ( shrink * cosine ) / max( rx, 1e-9 ) )
    + ringUp * ( ( shrink * sine ) / max( ry, 1e-9 ) )
    + ringAlong * ( ( bulge * outward ) / max( min( rx, ry ), 1e-9 ) );
  float tippedLength = length( tipped );
  vec3 strokeNormal = tippedLength > 1e-9 ? tipped / tippedLength : ringSide;
  vec4 strokeLook = vec4( r5.x, r5.y, strokeColour.a, 0.0 );`;

/**
 * Makes a stroke material (one with vertex colours, whose shader already carries each corner's
 * look) take its corners from the rings' texture.
 */
function drawFromRings(material: MeshPhongMaterial, rings: { value: DataTexture }): void {
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms["strokeRings"] = rings;
    patch(shader);
  };
  material.customProgramCacheKey = () => "genocode-stroke-rings";
}

function patch(shader: WebGLProgramParametersWithUniforms): void {
  const replace = (from: string, to: string) => {
    if (!shader.vertexShader.includes(from)) throw new Error(`stroke shader: no ${from}`);
    shader.vertexShader = shader.vertexShader.replace(from, to);
  };
  replace("void main() {", `${RING_SHADER}\nvoid main() {\n${CORNER_SHADER}`);
  replace("#include <beginnormal_vertex>", "vec3 objectNormal = strokeNormal;");
  replace("#include <begin_vertex>", "vec3 transformed = strokePosition;");
  replace("vLook = instanceLook;", "vLook = strokeLook;");
  replace(
    "#include <color_vertex>",
    "#include <color_vertex>\nvColor = vec3( linearLight( strokeColour.r ), linearLight( strokeColour.g ), linearLight( strokeColour.b ) );",
  );
}

/** One mesh of strokes' tubes, solid or see-through, kept from frame to frame. */
export class GpuTubes {
  private readonly rings: { value: DataTexture };
  /** The rings' texture's numbers, written each frame. */
  private data: Float32Array;
  private geometry = new BufferGeometry();
  /** The rings each tube has and the corners round them, which the mesh's corners are laid for. */
  private layout = "";
  readonly mesh: Mesh;

  constructor(material: MeshPhongMaterial) {
    const [texture, data] = ringTexture(1);
    this.rings = { value: texture };
    this.data = data;
    drawFromRings(material, this.rings);
    this.mesh = new Mesh(this.geometry, material);
    // The corners are only placed in the shader, so three can't tell where the tubes are.
    this.mesh.frustumCulled = false;
  }

  /** Shows these tubes; `fade` multiplies their see-through. */
  set(tubes: readonly TubeRings[], fade: number): void {
    let count = 0;
    for (const t of tubes) count += ringCount(t);
    const layout = tubes.map((t) => `${ringCount(t)}x${t.sides}`).join(",");
    if (layout !== this.layout) this.lay(tubes, count, layout);

    // Room for every ring, with a quarter to spare so a growing creature doesn't need a new texture
    // every frame.
    if (this.data.length < count * TEXELS * 4) {
      this.rings.value.dispose();
      [this.rings.value, this.data] = ringTexture(Math.ceil(count * 1.25));
    }
    const data = this.data;
    let at = 0;
    for (const t of tubes) {
      eachRing(t, (r, bulge, out) => {
        const { at: middle, along, side, up, colour } = r;
        data[at] = middle[0];
        data[at + 1] = middle[1];
        data[at + 2] = middle[2];
        data[at + 3] = r.rx;
        data[at + 4] = along[0];
        data[at + 5] = along[1];
        data[at + 6] = along[2];
        data[at + 7] = r.ry;
        data[at + 8] = side[0];
        data[at + 9] = side[1];
        data[at + 10] = side[2];
        data[at + 11] = bulge;
        data[at + 12] = up[0];
        data[at + 13] = up[1];
        data[at + 14] = up[2];
        data[at + 15] = out;
        // sRGB here: the shader turns it into linear light.
        data[at + 16] = colour[0];
        data[at + 17] = colour[1];
        data[at + 18] = colour[2];
        data[at + 19] = colour[3] * fade;
        data[at + 20] = r.shine;
        data[at + 21] = r.sharpness;
        at += TEXELS * 4;
      });
    }
    this.rings.value.needsUpdate = true;
  }

  /** Lays out the corners: each one's ring, and the cosine and sine of its way round. */
  private lay(tubes: readonly TubeRings[], count: number, layout: string): void {
    let corners = 0;
    let triangles = 0;
    for (const t of tubes) {
      corners += ringCount(t) * t.sides;
      triangles += (ringCount(t) - 1) * t.sides * 6;
    }
    const position = new Float32Array(corners * 3);
    const index = new Uint32Array(triangles);
    let ring = 0;
    let corner = 0;
    let joined = 0;
    for (const t of tubes) {
      const { sides } = t;
      const rings = ringCount(t);
      for (let k = 0; k < rings; k++, ring++) {
        for (let j = 0; j < sides; j++) {
          const angle = (2 * Math.PI * j) / sides;
          position[(corner + j) * 3] = ring;
          position[(corner + j) * 3 + 1] = Math.cos(angle);
          position[(corner + j) * 3 + 2] = Math.sin(angle);
        }
        // Joins this ring to the one before it, as stroke.ts's `join` does.
        if (k > 0) {
          const first = corner - sides;
          for (let j = 0; j < sides; j++) {
            const a = first + j;
            const b = first + ((j + 1) % sides);
            const c = corner + j;
            const d = corner + ((j + 1) % sides);
            index.set([a, b, d, a, d, c], joined);
            joined += 6;
          }
        }
        corner += sides;
      }
    }
    if (ring !== count) throw new Error("stroke rings miscounted");
    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(position, 3));
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.mesh.geometry = this.geometry;
    this.layout = layout;
  }

  dispose(): void {
    this.geometry.dispose();
    this.rings.value.dispose();
  }
}

/** A texture with room for `rings` rings, and its numbers. */
function ringTexture(rings: number): [DataTexture, Float32Array] {
  const texels = Math.max(1, rings) * TEXELS;
  const height = Math.ceil(texels / ROW);
  const data = new Float32Array(ROW * height * 4);
  const texture = new DataTexture(data, ROW, height, RGBAFormat, FloatType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return [texture, data];
}
