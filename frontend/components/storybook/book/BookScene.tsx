import Image from 'next/image';
import type { CSSProperties } from 'react';
import { BookArt } from './BookArt';
import { activeOptions } from '@/lib/storybook/book/mini-games';
import type { BookScene as Scene, BookState } from '@/lib/storybook/book/types';

export function BookScene({scene,state,hint,busy,motion,onAction,ratio}:{scene:Scene;state:BookState;hint:boolean;busy:boolean;motion:boolean;onAction:(key:string)=>void;ratio:number}){
  const allowed=new Set(activeOptions(scene,state).map(option=>option.key));
  const result=scene.kind==='help'&&state.ready;
  const art=scene.options.find(option=>option.key===state.selected)?.art;
  return <div className={`book-stage ${motion?'book-motion':''} ${state.paused?'book-still':''}`} style={{'--page-ratio':ratio} as CSSProperties} data-testid="book-stage" data-scene={scene.id} data-step={state.step} data-ready={String(state.ready)}>
    <div className="book-world">
      <Image className="book-illustration" src={scene.image} alt={scene.alt} fill sizes="(max-width: 800px) 100vw, 80vw" unoptimized priority/>
      {scene.result_image&&<Image className={`book-illustration book-result ${result?'book-result-shown':''}`} src={scene.result_image} alt={result?'Миша получил мишку и обнимает его. Мама улыбается рядом.':''} fill sizes="(max-width: 800px) 100vw, 80vw" unoptimized/>}
      <div className="book-daylight" aria-hidden="true"/>
      {scene.kind==='sequence'&&<div aria-hidden="true" className={`book-train ${state.step===1?'book-train-selected':''} ${state.ready?'book-train-on-track':''}`}><BookArt art="train"/></div>}
      {scene.hotspots.map(spot=>{
        const option=scene.options.find(option=>option.key===spot.action)!;
        const enabled=allowed.has(spot.action)&&!busy;
        const highlighted=hint&&(option.target||scene.kind==='sequence');
        return <button key={spot.action} type="button" className={`book-hotspot ${highlighted?'book-hotspot-hint':''} ${state.selected===spot.action&&state.ready&&scene.kind==='find'?'book-hotspot-found':''} ${scene.kind==='sequence'&&state.step===1&&spot.action==='place_train'?'book-track-target':''}`} aria-label={option.label} aria-disabled={!enabled} tabIndex={enabled?0:-1} style={{left:`${spot.x}%`,top:`${spot.y}%`,width:`${spot.width}%`,height:`${spot.height}%`}} onClick={()=>enabled&&onAction(spot.action)}>
          <span className="book-hit-mark" aria-hidden="true">{scene.kind==='sequence'&&spot.action==='place_train'?'＋':'✦'}</span>
        </button>;
      })}
      {state.ready&&scene.kind==='match'&&art==='train'&&<div className="book-match-reward" aria-hidden="true"><BookArt art="train"/></div>}
      {state.ready&&['find','aac'].includes(scene.kind)&&<div className="book-soft-reaction" aria-hidden="true">✦</div>}
    </div>
    <span className="book-page-corner" aria-hidden="true"/>
  </div>;
}
