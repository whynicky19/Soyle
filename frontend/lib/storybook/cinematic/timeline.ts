/** Continuous articulated animation. Coordinates use a 1280 × 720 stage; actor origins are feet. */
export type Actor = 'child' | 'mother';
export type TeddyHolder = 'shelf' | 'mother' | 'child';
export type Phase = 'INTRO' | 'NOTICE' | 'REACH' | 'AWAIT_REQUEST' | 'REQUEST' | 'MOTHER_ENTER' | 'MOTHER_WALK' | 'PICK_UP' | 'CARRY' | 'TRANSFER' | 'HUG' | 'COMPLETE';
export type Pose = {
  x: number; y: number; scale: number; torso: number; head: number;
  armL: number; armR: number; elbowL: number; elbowR: number;
  legL: number; legR: number; kneeL: number; kneeR: number;
  blink: number; gripL: number; gripR: number;
};
export interface FrameAdapter {
  setPose(actor: Actor, pose: Partial<Pose>): void;
  attachTeddy(holder: TeddyHolder): void;
  narrate(text: string, signal: AbortSignal): Promise<void>;
  onPhase(phase: Phase): void;
  onCheckpoint?(checkpoint: { phase: Phase; interactionRequired: boolean }): void;
}
export interface TimelineOptions { reducedMotion?: boolean; onError?: (error: unknown) => void }
export const REST_POSE: Pose = { x: 0, y: 610, scale: 1, torso: 0, head: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0, legL: 0, legR: 0, kneeL: 0, kneeR: 0, blink: 0, gripL: 0, gripR: 0 };
export const STAGE_MARKS = { child: 470, motherOffstage: 1330, shelf: 950, transfer: 660, floor: 610 } as const;
type Gsap = (typeof import('gsap'))['gsap'];

/** Create in a browser effect and call dispose on cleanup. No global animation timeline is used. */
export async function createTimelineController(adapter: FrameAdapter, options: TimelineOptions = {}) {
  const { gsap } = await import('gsap');
  return new TimelineController(gsap, adapter, options);
}

export class TimelineController {
  private poses: Record<Actor, Pose> = { child: { ...REST_POSE, x: STAGE_MARKS.child, scale: 0.85 }, mother: { ...REST_POSE, x: STAGE_MARKS.motherOffstage, scale: 1.1 } };
  private active = new Set<ReturnType<Gsap['timeline']>>();
  private finishers = new Set<() => void>();
  private audio?: AbortController;
  private generation = 0;
  private disposed = false;
  private manualPause = false;
  private hidden = false;
  private resumeWaiters = new Set<() => void>();
  private phase: Phase = 'INTRO';
  private pendingHug = false;
  private readonly visibility = () => { this.hidden = document.hidden; this.updatePause(); };
  constructor(private gsap: Gsap, private adapter: FrameAdapter, private options: TimelineOptions = {}) {
    if (typeof document !== 'undefined') { this.hidden = document.hidden; document.addEventListener('visibilitychange', this.visibility); }
  }
  get currentPhase() { return this.phase; }
  get isPaused() { return this.manualPause || this.hidden; }
  private enter(phase: Phase, interactionRequired = false) {
    this.phase = phase;
    this.adapter.onPhase(phase);
    this.adapter.onCheckpoint?.({ phase, interactionRequired });
  }
  private valid(token: number) { return !this.disposed && token === this.generation; }
  private async ready(token: number) {
    if (this.isPaused && this.valid(token)) await new Promise<void>(resolve => this.resumeWaiters.add(resolve));
    return this.valid(token);
  }
  private updatePause() {
    this.active.forEach(timeline => this.isPaused ? timeline.pause() : timeline.resume());
    if (this.isPaused) this.audio?.abort();
    else { this.resumeWaiters.forEach(resolve => resolve()); this.resumeWaiters.clear(); }
  }
  pause() { this.manualPause = true; this.updatePause(); }
  resume() { this.manualPause = false; this.updatePause(); }
  private async say(text: string, token: number) {
    // A paused utterance restarts on resume, so its final words cannot disappear.
    while (await this.ready(token)) {
      const audio = new AbortController(); this.audio = audio;
      try { await this.adapter.narrate(text, audio.signal); }
      catch (error) { if (!audio.signal.aborted) this.options.onError?.(error); }
      finally { if (this.audio === audio) this.audio = undefined; }
      if (!this.valid(token)) return;
      if (!audio.signal.aborted) return;
    }
  }
  private async move(actor: Actor, target: Partial<Pose>, seconds: number, token: number, walking = false) {
    if (!await this.ready(token)) return;
    if (this.options.reducedMotion) {
      Object.assign(this.poses[actor], target);
      this.adapter.setPose(actor, { ...this.poses[actor] });
      return;
    }
    await new Promise<void>(resolve => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; this.finishers.delete(finish); this.active.delete(timeline); resolve(); };
      const clock = { progress: 0 };
      const timeline = this.gsap.timeline({ paused: this.isPaused, onComplete: finish });
      this.finishers.add(finish); this.active.add(timeline);
      timeline.to(this.poses[actor], { ...target, duration: seconds, ease: walking ? 'none' : 'power2.inOut', onUpdate: () => this.adapter.setPose(actor, { ...this.poses[actor] }) }, 0);
      if (walking) timeline.to(clock, { progress: 1, duration: seconds, ease: 'none', onUpdate: () => {
        const stride = Math.sin(clock.progress * Math.PI * 2 * 3);
        const weight = Math.sin(clock.progress * Math.PI);
        this.adapter.setPose(actor, { legL: stride * 19 * weight, legR: -stride * 19 * weight, kneeL: Math.max(0, -stride) * 24 * weight, kneeR: Math.max(0, stride) * 24 * weight, torso: stride * 2 * weight, y: this.poses[actor].y - Math.abs(stride) * 5 * weight });
      } }, 0);
    });
    if (this.valid(token)) this.adapter.setPose(actor, { ...this.poses[actor] });
  }
  private cancel() {
    this.generation++; this.audio?.abort(); this.audio = undefined;
    this.active.forEach(t => t.kill()); this.active.clear();
    this.finishers.forEach(finish => finish()); this.finishers.clear();
    this.resumeWaiters.forEach(resolve => resolve()); this.resumeWaiters.clear();
  }
  async start() {
    if (this.disposed) return;
    this.cancel(); const token = this.generation; this.pendingHug = false;
    this.poses = { child: { ...REST_POSE, x: STAGE_MARKS.child, scale: 0.85 }, mother: { ...REST_POSE, x: STAGE_MARKS.motherOffstage, scale: 1.1 } };
    (['child', 'mother'] as const).forEach(actor => this.adapter.setPose(actor, { ...this.poses[actor] }));
    this.adapter.attachTeddy('shelf'); this.enter('INTRO');
    await this.say('Миша хочет поиграть с мишкой.', token); if (!this.valid(token)) return;
    this.enter('NOTICE'); await this.move('child', { head: -14, torso: -4 }, 0.65, token); if (!this.valid(token)) return;
    await this.say('Мишка высоко на полке.', token); if (!this.valid(token)) return;
    this.enter('REACH'); await this.move('child', { armR: -135, elbowR: -22, head: -20, torso: -8 }, 1.1, token); if (!this.valid(token)) return;
    await this.say('Попросим маму помочь.', token); if (!this.valid(token)) return;
    this.enter('AWAIT_REQUEST', true);
  }
  replay() { return this.start(); }
  /** Only call after the child has selected/built and confirmed their AAC request. */
  async request(text = 'Дай мишку, пожалуйста.') {
    if (this.disposed || this.phase !== 'AWAIT_REQUEST' || this.isPaused) return;
    const token = this.generation;
    this.enter('REQUEST'); await this.say(text, token); if (!this.valid(token)) return;
    this.enter('MOTHER_ENTER'); await this.move('mother', { x: 1150, head: 8 }, 0.8, token, true); if (!this.valid(token)) return;
    this.enter('MOTHER_WALK'); await this.move('mother', { x: STAGE_MARKS.shelf, armL: 12, armR: -12 }, 1.6, token, true); if (!this.valid(token)) return;
    this.enter('PICK_UP'); await this.move('mother', { armL: 145, elbowL: 18, head: -12, torso: 8 }, 1.1, token); if (!this.valid(token)) return;
    this.adapter.attachTeddy('mother');
    await this.move('mother', { armL: 65, elbowL: 60, gripL: 1, head: 0 }, 0.7, token); if (!this.valid(token)) return;
    this.enter('CARRY'); await this.move('mother', { x: STAGE_MARKS.transfer }, 1.8, token, true); if (!this.valid(token)) return;
    this.enter('TRANSFER');
    await Promise.all([this.move('mother', { armL: 80, elbowL: 38, torso: 10 }, 0.8, token), this.move('child', { armL: 65, armR: -65, elbowL: 50, elbowR: -50, head: 0, torso: 0 }, 0.8, token)]); if (!this.valid(token)) return;
    this.adapter.attachTeddy('child');
    await this.move('mother', { armL: 0, elbowL: 0, gripL: 0, torso: 0 }, 0.7, token); if (!this.valid(token)) return;
    await this.say('Мишка у тебя! Обними его.', token); if (!this.valid(token)) return;
    this.pendingHug = true; this.enter('HUG', true);
  }
  /** This gate is a separate tap/gesture; the motor sequence cannot complete it. */
  async hug() {
    if (!this.pendingHug || this.disposed || this.isPaused) return;
    this.pendingHug = false; const token = this.generation;
    await this.move('child', { armL: 42, armR: -42, elbowL: 105, elbowR: -105, head: 10, gripL: 1, gripR: 1 }, 1, token); if (!this.valid(token)) return;
    await this.say('Как хорошо играть вместе!', token); if (!this.valid(token)) return;
    this.enter('COMPLETE');
  }
  /** Skip motor/audio beats to the next interaction, never award completion. */
  skip() {
    if (this.disposed) return;
    const afterRequest = !['INTRO', 'NOTICE', 'REACH', 'AWAIT_REQUEST'].includes(this.phase);
    this.cancel();
    if (!afterRequest) { this.enter('AWAIT_REQUEST', true); return; }
    if (this.phase === 'COMPLETE') return;
    this.adapter.attachTeddy('child');
    Object.assign(this.poses.child, { armL: 65, armR: -65, elbowL: 50, elbowR: -50, head: 0, torso: 0 });
    Object.assign(this.poses.mother, { x: STAGE_MARKS.transfer, armL: 0, armR: 0, elbowL: 0, elbowR: 0 });
    (['child', 'mother'] as const).forEach(actor => this.adapter.setPose(actor, { ...this.poses[actor] }));
    this.pendingHug = true; this.enter('HUG', true);
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.cancel(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibility); }
}
