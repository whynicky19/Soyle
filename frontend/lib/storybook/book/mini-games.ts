import type { BookOption, BookScene, BookState } from './types';

/** UI affordances mirror the server's explicit gates; the server owns progression. */
export function activeOptions(scene:BookScene,state:BookState):BookOption[]{
  if(state.ready||state.paused||state.completed)return [];
  if(scene.kind==='instruction')return scene.options.filter(option=>option.key===scene.sequence_steps?.[state.step]);
  if(scene.kind==='sequence')return scene.options.filter(option=>option.key===(state.step===0?'pick_train':'place_train'));
  return scene.options;
}
export function canTurnPage(scene:BookScene,state:BookState){return !state.paused&&!state.completed&&(state.ready||scene.kind==='ending'||scene.kind==='watch');}
export function promptFor(scene:BookScene,state:BookState){
  if(state.ready)return state.feedback;
  if(scene.kind==='sequence'&&state.step===1)return 'Теперь поставь поезд на рельсы';
  return scene.instruction;
}
