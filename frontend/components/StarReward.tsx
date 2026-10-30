"use client";

import Image from 'next/image';
import { X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { starLabel } from '@/lib/rewards';

export function StarVault({total, onOpen}: {total: number; onOpen: () => void}) {
  return <button type="button" className="star-vault" data-star-vault aria-label={`Моя копилка: ${total} ${starLabel(total)}`} onClick={onOpen}>
    <Image src="/child-room/reward-star.webp" alt="" width={56} height={56}/><span><strong>{total} {starLabel(total)}</strong><small>Моя копилка</small></span><span aria-hidden="true">›</span>
  </button>;
}

export function StarReward({stars, total, calmMode, onDone}: {stars: number; total: number; calmMode: boolean; onDone: () => void}) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const vault = document.querySelector<HTMLElement>('[data-star-vault]');
    const target = vault?.getBoundingClientRect();
    const visibleVault = target && !vault?.closest("[inert]") && target.left >= 0 && target.right <= window.innerWidth;
    if (layer.current && target && visibleVault) {
      layer.current.style.setProperty('--flight-x', `${target.x + target.width / 2 - window.innerWidth / 2}px`);
      layer.current.style.setProperty('--flight-y', `${target.y + target.height / 2 - window.innerHeight / 2}px`);
      layer.current.dataset.hasVault = 'true';
    }
    const timers = [window.setTimeout(onDone, 4500)];
    let pulse: Animation | undefined;
    if (vault && visibleVault && !calmMode && !reduced.matches) timers.push(window.setTimeout(() => {
      if (!reduced.matches) pulse = vault.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}], {duration:450,easing:'ease-out'});
    }, 2850));
    return () => {timers.forEach(window.clearTimeout);pulse?.cancel();};
  }, [calmMode, onDone]);
  return <div ref={layer} className="starlight-reward" data-calm={calmMode} aria-label="Полученная награда">
    <div className="starlight-rays" aria-hidden="true"/>
    <div className="starlight-card"><button className="starlight-close" type="button" aria-label="Закрыть поздравление" onClick={onDone}><X size={22}/></button>
      <div className="starlight-hero" aria-hidden="true"><Image src="/child-room/reward-star.webp" alt="" width={240} height={240} priority/></div>
      <div role="status" aria-live="polite" aria-atomic="true"><h2>+{stars} {starLabel(stars)}!</h2><p>Задание сохранено</p><strong>В твоей копилке: {total}</strong></div>
    </div>
    <div className="starlight-particles" aria-hidden="true">{Array.from({length:12},(_,i)=><span key={i} style={{'--particle-x':`${Math.cos(i * Math.PI / 6) * (130 + i % 3 * 24)}px`,'--particle-y':`${Math.sin(i * Math.PI / 6) * 150}px`,'--particle-turn':`${i * 29}deg`,'--particle-delay':`${i % 4 * 40}ms`} as CSSProperties}><Image src="/child-room/reward-star.webp" alt="" width={36} height={36}/></span>)}</div>
    <div className="starlight-flights" aria-hidden="true">{Array.from({length:Math.min(5,stars)},(_,i)=><span key={i} style={{animationDelay:`${1950+i*110}ms`} as CSSProperties}><Image src="/child-room/reward-star.webp" alt="" width={42} height={42}/></span>)}</div>
  </div>;
}
