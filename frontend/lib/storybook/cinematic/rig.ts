import { REST_POSE, type Actor, type Pose, type TeddyHolder } from "./timeline";

export type RigPart = { box: [number, number, number, number]; anchor: [number, number]; purpose: string };
export type RigAsset = { url: string; width: number; height: number; parts: Record<string, RigPart> };
export type RigManifest = { version: number; authoring: string; actors: Record<Actor, RigAsset>; teddy: RigAsset; environment: { room: string; sourceWidth: number; sourceHeight: number }; };
const degrees = (angle: number) => angle * Math.PI / 180;
const rotate = (angle: number) => `rotate(${angle})`;

/** Direct SVG joint updates keep React out of the animation frame loop. */
export class RigRenderer {
  private poses: Record<Actor, Pose> = { child: { ...REST_POSE, x: 470, scale: .85 }, mother: { ...REST_POSE, x: 1330, scale: 1.1 } };
  private holder: TeddyHolder = "shelf";
  private attached: TeddyHolder = "shelf";
  private blend?: { x: number; y: number; started: number; duration: number };
  private frame = 0;
  private disposed = false;
  private pausedAt: number | null = null;
  private readonly nodes = new Map<string, SVGElement>();
  constructor(private svg: SVGSVGElement, private reducedMotion = false) {
    svg.querySelectorAll<SVGElement>("[data-joint]").forEach((node) => this.nodes.set(node.dataset.joint!, node));
    this.tick();
  }
  private node(key: string) { return this.nodes.get(key); }
  private transform(key: string, value: string) { this.node(key)?.setAttribute("transform", value); }
  setPose(actor: Actor, change: Partial<Pose>) {
    const p = Object.assign(this.poses[actor], change);
    const footY = (leg: number, knee: number) => -140 + Math.cos(degrees(leg)) * 70 + Math.cos(degrees(leg + knee)) * 70;
    const grounding = Math.max(footY(p.legL, p.kneeL), footY(p.legR, p.kneeR));
    this.transform(`${actor}:root`, `translate(${p.x} ${p.y - grounding}) scale(${p.scale * (p.facing < 0 ? -1 : 1)} ${p.scale})`);
    this.node(`${actor}:shadow`)?.setAttribute("cx", String(p.x));
    this.transform(`${actor}:torso`, `translate(0 -140) ${rotate(p.torso)}`);
    this.transform(`${actor}:head`, `translate(0 -135) ${rotate(p.head)}`);
    for (const side of ["L", "R"] as const) {
      const sign = side === "L" ? -1 : 1;
      this.transform(`${actor}:arm${side}`, `translate(${sign * 35} -115) ${rotate(p[`arm${side}`])}`);
      this.transform(`${actor}:elbow${side}`, `translate(0 70) ${rotate(p[`elbow${side}`])}`);
      this.transform(`${actor}:leg${side}`, `translate(${sign * 20} -136) ${rotate(p[`leg${side}`])}`);
      this.transform(`${actor}:knee${side}`, `translate(0 70) ${rotate(p[`knee${side}`])}`);
    }
    this.node(`${actor}:eyes-open`)?.setAttribute("opacity", p.blink > .55 ? "0" : "1");
    this.node(`${actor}:eyes-closed`)?.setAttribute("opacity", p.blink > .55 ? "1" : "0");
    this.svg.querySelector(`[data-actor="${actor}"]`)?.setAttribute("data-head-angle", p.head.toFixed(2));
    this.updateTeddy();
  }
  private grip(actor: Actor): { x: number; y: number } {
    const point = this.node(`${actor}:gripR`) as SVGGraphicsElement | undefined;
    const matrix = point?.getCTM();
    const rootMatrix = this.svg.getCTM();
    if (!matrix || !rootMatrix) return { x: 1051, y: 203 };
    const world = new DOMPoint(0, 0).matrixTransform(matrix).matrixTransform(rootMatrix.inverse());
    return { x: world.x, y: world.y };
  }
  attachTeddy(holder: TeddyHolder) {
    if (holder === this.holder) return;
    const current = this.teddyPosition();
    this.blend = this.reducedMotion ? undefined : { ...current, started: performance.now(), duration: holder === "shelf" ? 0 : 360 };
    this.holder = holder;
    this.svg.dataset.teddyHolder = holder;
    this.updateTeddy();
  }
  private teddyPosition() {
    if (this.holder === "shelf") return { x: 1051, y: 203 };
    if (this.holder === "mother") return this.grip("mother");
    const right = this.grip("child");
    return { x: right.x - 15, y: right.y - 15 };
  }
  private updateTeddy() {
    if (this.disposed || this.pausedAt !== null) return;
    const point = this.teddyPosition();
    if (this.blend) {
      const t = Math.min(1, (performance.now() - this.blend.started) / Math.max(1, this.blend.duration));
      const eased = t * t * (3 - 2 * t);
      point.x = this.blend.x + (point.x - this.blend.x) * eased;
      point.y = this.blend.y + (point.y - this.blend.y) * eased;
      if (t === 1) this.blend = undefined;
    }
    for (const actor of ["child", "mother"] as const) {
      const foreground = this.node(`${actor}:foreground`);
      const elbow = this.node(`${actor}:elbowR`) as SVGGraphicsElement | undefined;
      const matrix = elbow?.getCTM(); const root = this.svg.getCTM();
      if (foreground && matrix && root) {
        const m = root.inverse().multiply(matrix);
        foreground.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
        foreground.setAttribute("visibility", this.holder === actor ? "visible" : "hidden");
      }
    }
    this.transform("teddy", `translate(${point.x} ${point.y})`);
    const teddy = this.node("teddy");
    teddy?.setAttribute("data-x", point.x.toFixed(2)); teddy?.setAttribute("data-y", point.y.toFixed(2));
    if (this.attached !== this.holder) { this.attached = this.holder; teddy?.setAttribute("data-holder", this.holder); }
  }
  setPaused(paused: boolean) {
    if (paused && this.pausedAt === null) this.pausedAt = performance.now();
    else if (!paused && this.pausedAt !== null) { if (this.blend) this.blend.started += performance.now() - this.pausedAt; this.pausedAt = null; this.updateTeddy(); }
  }
  private tick = () => { if (this.disposed) return; this.updateTeddy(); this.frame = requestAnimationFrame(this.tick); };
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.nodes.clear(); }
}
