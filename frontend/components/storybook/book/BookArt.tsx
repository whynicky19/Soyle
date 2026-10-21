import Image from 'next/image';
import type { BookArt as Art } from '@/lib/storybook/book/types';
const frames={teddy:[47,50,536,579],train:[719,199,495,458],ball:[88,726,467,458],track:[663,773,568,408]};
export function BookArt({art}:{art:Art}){
  const key=art==='point'?'teddy':art==='help'?'teddy':art;
  return <span className={`book-art book-art-${art}`} aria-hidden="true">{art==='help'?<Image src="/app-illustrations/aac-help.webp" alt="" width={120} height={120} unoptimized/>:<svg className="book-object-sprite" viewBox={frames[key].join(' ')} preserveAspectRatio="xMidYMid meet"><image href="/storybooks/favorite-toy-book/objects.webp" width="1262" height="1246"/></svg>}{art==='point'&&<span className="book-point">↗</span>}</span>;
}
