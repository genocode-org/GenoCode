// Draws the turtle's path over a creature: each move as a line with an arrowhead at its end, and
// each jump back at the end of a `branch` as a dashed line. Steps can be lit up (for the code under
// the cursor) and picked with the mouse (to show the code that made them).

import type { PathStep } from "@genocode/core";
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  type Raycaster,
  Vector3,
} from "three";

/** A move's colour, a lit-up move's, and a move's while others are lit up. */
const MOVE = new Color(0xffc23d);
const LIT = new Color(0xffffff);
const DIM = new Color(0x6b5a35);
const RETURN = 0x8a93a6;

/** An arrowhead's length as a share of the creature's size, and of its own move, at most. */
const HEAD_OF_CREATURE = 0.035;
const HEAD_OF_MOVE = 0.4;

export class PathOverlay {
  readonly group = new Group();
  private steps: readonly PathStep[] = [];
  /** Indexes into `steps` of the moves and the returns, in the order they're drawn. */
  private moves: number[] = [];
  private returns: number[] = [];
  private moveLines: LineSegments | undefined;
  private returnLines: LineSegments | undefined;
  private heads: InstancedMesh | undefined;
  private readonly moveMaterial = new LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    transparent: true,
  });
  private readonly returnMaterial = new LineDashedMaterial({
    color: RETURN,
    depthTest: false,
    transparent: true,
    opacity: 0.8,
  });
  private readonly headMaterial = new MeshBasicMaterial({ depthTest: false, transparent: true });
  private readonly headShape = new ConeGeometry(0.5, 1, 8).translate(0, -0.5, 0);
  private lit: ((s: PathStep) => boolean) | undefined;

  constructor() {
    // Drawn after the creature and over it, so the whole path always shows.
    this.group.renderOrder = 1;
  }

  /** Shows a new path; `size` is the creature's radius, which sets the arrowheads' size. */
  set(steps: readonly PathStep[] | undefined, size: number): void {
    this.clear();
    this.steps = steps ?? [];
    this.moves = [];
    this.returns = [];
    this.steps.forEach((s, i) => (s.kind === "move" ? this.moves : this.returns).push(i));
    if (this.moves.length > 0) {
      this.moveLines = new LineSegments(this.segments(this.moves), this.moveMaterial);
      this.moveLines.geometry.setAttribute(
        "color",
        new Float32BufferAttribute(new Float32Array(this.moves.length * 6), 3),
      );
      this.heads = this.arrowheads(size);
      this.group.add(this.moveLines, this.heads);
    }
    if (this.returns.length > 0) {
      this.returnLines = new LineSegments(this.segments(this.returns), this.returnMaterial);
      this.returnLines.computeLineDistances();
      this.returnMaterial.dashSize = this.returnMaterial.gapSize = size * 0.02;
      this.group.add(this.returnLines);
    }
    for (const o of this.group.children) o.renderOrder = 1;
    this.paint();
  }

  /** Lights up the steps for which `which` is true, dimming the other moves; none lights all up. */
  highlight(which: ((s: PathStep) => boolean) | undefined): void {
    this.lit = which;
    this.paint();
  }

  /** The step under the ray, if any: the nearest to the eye. */
  pick(ray: Raycaster): PathStep | undefined {
    const lines = [this.moveLines, this.returnLines].filter((l) => l !== undefined);
    const hit = ray.intersectObjects(lines, false)[0];
    if (hit?.index === undefined) return undefined;
    const order = hit.object === this.moveLines ? this.moves : this.returns;
    const i = order[Math.floor(hit.index / 2)];
    return i === undefined ? undefined : this.steps[i];
  }

  dispose(): void {
    this.clear();
    this.moveMaterial.dispose();
    this.returnMaterial.dispose();
    this.headMaterial.dispose();
    this.headShape.dispose();
  }

  private clear(): void {
    for (const o of [this.moveLines, this.returnLines, this.heads]) {
      if (o === undefined) continue;
      this.group.remove(o);
      o.geometry.dispose();
    }
    this.heads?.dispose();
    this.moveLines = this.returnLines = this.heads = undefined;
  }

  private segments(order: number[]): BufferGeometry {
    const points = new Float32Array(order.length * 6);
    order.forEach((i, k) => {
      const s = this.steps[i]!;
      points.set(s.from, k * 6);
      points.set(s.to, k * 6 + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points, 3));
    return g;
  }

  /** A cone at the end of each move, its tip on the end, pointing the way the turtle went. */
  private arrowheads(size: number): InstancedMesh {
    const heads = new InstancedMesh(this.headShape, this.headMaterial, this.moves.length);
    const up = new Vector3(0, 1, 0);
    const from = new Vector3();
    const to = new Vector3();
    const way = new Vector3();
    const turn = new Quaternion();
    const scale = new Vector3();
    const m = new Matrix4();
    this.moves.forEach((i, k) => {
      const s = this.steps[i]!;
      from.set(...s.from);
      to.set(...s.to);
      way.subVectors(to, from);
      const length = Math.min(size * HEAD_OF_CREATURE, way.length() * HEAD_OF_MOVE);
      turn.setFromUnitVectors(up, way.normalize());
      scale.set(length * 0.6, length, length * 0.6);
      heads.setMatrixAt(k, m.compose(to, turn, scale));
      heads.setColorAt(k, MOVE);
    });
    heads.computeBoundingSphere();
    return heads;
  }

  /** Colours each move and its arrowhead for what is lit up. */
  private paint(): void {
    if (this.moveLines === undefined || this.heads === undefined) return;
    const colours = this.moveLines.geometry.getAttribute("color") as Float32BufferAttribute;
    this.moves.forEach((i, k) => {
      const c = this.lit === undefined ? MOVE : this.lit(this.steps[i]!) ? LIT : DIM;
      colours.setXYZ(k * 2, c.r, c.g, c.b);
      colours.setXYZ(k * 2 + 1, c.r, c.g, c.b);
      this.heads!.setColorAt(k, c);
    });
    colours.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}
