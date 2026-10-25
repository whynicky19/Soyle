export type SearchObject = {id:string;concept_id:string;label:string;instructions:Record<string,string>;hit_point:[number,number];hit_polygons:[number,number][][];hint_regions:[number,number,number,number][];beginner:boolean};
export type SearchScene = {key:string;title:string;image:{media_ref:string;version:string;width:number;height:number;sha256:string};objects:SearchObject[]};
export type ExplorationContent = {exploration?:SearchScene};
export type SearchRound = {responses:{object_id:string;point:[number,number]|null;keyboard:boolean}[];related_responses?:string[];outside_taps:number;hint_level:number;repeats:number;audio_ready:boolean;resolved:boolean};
export type SearchMeasurement = {attempt_status:'completed'|'participated'|'break'|'refused'|'technical_error';attempts_count:number;correct_answers:number;independent_completions:number;prompted_completions:number;prompts_used:number;gameplay_choices:number;independence:number;prompt_level:'independent'|'minimal';communication_initiatives:number};
export type SearchSnapshot = {id:string;revision:number;preview:boolean;exercise_id:number;version_id:number;scene:SearchScene;state:{status:'active'|'paused'|'completed'|'refused'|'technical_error';level:1|2|3;accessible_labels:boolean;order:string[];index:number;round:SearchRound;outcomes:(SearchRound & {target_key:string;concept_id:string;label:string;outcome:'independent'|'prompted'})[];feedback:string};measurement:SearchMeasurement;details:Record<string,unknown>};
export type SearchAction = 'audio'|'repeat'|'hint'|'select'|'outside'|'next'|'pause'|'resume'|'refuse'|'technical_error';
export type SearchEvent = {action:SearchAction;point?:[number,number];object_id?:string;keyboard?:boolean;audio_success?:boolean;reason?:string};
export function scenePoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}):[number,number] {
  return [(clientX-rect.left)/rect.width,(clientY-rect.top)/rect.height];
}
export function polygonPath(polygons:[number,number][][]):string {
  return polygons.map(points=>points.map(([x,y],i)=>`${i?'L':'M'}${x*1000},${y*1000}`).join(' ')+' Z').join(' ');
}
