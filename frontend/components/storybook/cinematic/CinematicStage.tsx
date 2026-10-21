import { forwardRef } from 'react';
import type { RigManifest } from '@/lib/storybook/cinematic/rig';
import type { Phase } from '@/lib/storybook/cinematic/timeline';
import { CharacterRig, RigImage } from './CharacterRig';

export const CinematicStage = forwardRef<SVGSVGElement, { manifest: RigManifest; phase: Phase; hint: boolean; paused: boolean; onTeddy: () => void }>(function CinematicStage({ manifest, phase, hint, paused, onTeddy }, ref) {
  const interactive = ['INTRO', 'NOTICE', 'REACH', 'AWAIT_REQUEST', 'HUG'].includes(phase) && !paused;
  return <svg ref={ref} viewBox="0 0 1280 720" className="cinema-scene" data-testid="cinematic-stage" data-phase={phase} data-teddy-holder="shelf" aria-label="Комната Миши. Мишка на высокой полке, мама помогает его достать." role="group">
    <defs><radialGradient id="cinema-shadow"><stop stopColor="#513a26" stopOpacity=".2"/><stop offset="1" stopColor="#513a26" stopOpacity="0"/></radialGradient></defs>
    <rect width="1280" height="720" fill="#eadbc8"/>
    <image data-layer="room" href={manifest.environment.room} width="1280" height="720" preserveAspectRatio="xMidYMid meet"/>
    <g data-shelf-art="true" transform="translate(1051 203)"><RigImage asset={manifest.teddy} part="teddy" x={-48} y={-60} width={96} height={110}/></g>
    <ellipse data-joint="child:shadow" cx="470" cy="625" rx="65" ry="12" fill="url(#cinema-shadow)"/>
    <ellipse data-joint="mother:shadow" cx="1450" cy="625" rx="70" ry="14" fill="url(#cinema-shadow)"/>
    <CharacterRig actor="child" asset={manifest.actors.child}/>
    <CharacterRig actor="mother" asset={manifest.actors.mother}/>
    <g data-joint="teddy" data-holder="shelf" transform="translate(1051 203)">
      {(hint || phase === 'HUG') && <ellipse className="cinema-halo" cy="-4" rx="66" ry="76" fill="#fff4ad" fillOpacity=".45" stroke="#fff7cc" strokeWidth="3"/>}
      <g data-held-art="true"><RigImage asset={manifest.teddy} part="teddy" x={-48} y={-60} width={96} height={110}/></g>
      <g role="button" aria-label={phase === 'HUG' ? 'Обнять мишку в сцене' : 'Мишка на полке'} tabIndex={interactive ? 0 : -1} aria-disabled={!interactive} onClick={() => interactive && onTeddy()} onKeyDown={e => { if (interactive && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onTeddy(); } }}><rect className="cinema-hit" x={-65} y={-76} width="130" height="145" rx="36" fill="transparent"/></g>
    </g>
    {(['child', 'mother'] as const).map(actor => <g key={actor} data-joint={`${actor}:foreground`} visibility="hidden"><RigImage asset={manifest.actors[actor]} part="forearmR" x={-16} y={-9} width={32} height={83}/></g>)}
  </svg>;
});
