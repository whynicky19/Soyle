"use client";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type MouseEvent } from 'react';

export function usePetDrag(enabled: boolean, onTap: () => void) {
  const container = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({x:0,y:0});
  const position = useRef(offset);
  const [dragging,setDragging] = useState(false);
  const gesture = useRef<{id:number;x:number;y:number;origin:{x:number;y:number};moved:boolean}|null>(null);
  const suppressClick = useRef(false);
  function move(x:number,y:number) {
    const box=container.current?.getBoundingClientRect();
    if(!box)return;
    const left=box.left-position.current.x, top=box.top-position.current.y;
    const next={x:Math.max(8-left,Math.min(innerWidth-8-box.width-left,x)),y:Math.max(8-top,Math.min(innerHeight-8-box.height-top,y))};
    position.current=next;setOffset(next);
  }
  useEffect(()=>{
    // Reflow restores the safe inline position rather than leaving the pet off-screen.
    const reset=()=>{gesture.current=null;position.current={x:0,y:0};setOffset({x:0,y:0});setDragging(false);};
    window.addEventListener('resize',reset);
    return()=>window.removeEventListener('resize',reset);
  },[]);
  const handlers={
    onPointerDown(event:PointerEvent<HTMLButtonElement>){
      if(!enabled || !event.isPrimary || event.button!==0)return;
      suppressClick.current=false;
      gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,origin:position.current,moved:false};
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event:PointerEvent<HTMLButtonElement>){
      const start=gesture.current;if(!start || start.id!==event.pointerId)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(!start.moved && Math.hypot(dx,dy)<6)return;
      start.moved=true;suppressClick.current=true;setDragging(true);
      move(start.origin.x+dx,start.origin.y+dy);
    },
    onPointerUp(event:PointerEvent<HTMLButtonElement>){
      if(gesture.current?.id!==event.pointerId)return;
      gesture.current=null;setDragging(false);
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel(){gesture.current=null;setDragging(false);suppressClick.current=true;},
    onLostPointerCapture(){gesture.current=null;setDragging(false);},
    onClick(event:MouseEvent<HTMLButtonElement>){if(event.detail===0 || !suppressClick.current)onTap();suppressClick.current=false;},
    onKeyDown(event:KeyboardEvent<HTMLButtonElement>){
      if(!enabled)return;
      if(event.key==='Home'){event.preventDefault();position.current={x:0,y:0};setOffset({x:0,y:0});return;}
      const directions:Record<string,[number,number]>={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};
      const delta=directions[event.key];if(delta){event.preventDefault();move(position.current.x+delta[0],position.current.y+delta[1]);}
    },
  };
  return {container,offset,dragging,handlers};
}
