export type BookArt = 'teddy'|'train'|'ball'|'help'|'point'|'track';
export type BookOption = {key:string;label:string;art:BookArt;feedback:string;speech?:string;target?:boolean};
export type BookHotspot = {action:string;x:number;y:number;width:number;height:number};
export type BookScene = {id:string;title:string;kind:'find'|'match'|'aac'|'help'|'sequence'|'ending';narration:string;instruction:string;hint:string;image:string;result_image?:string;alt:string;options:BookOption[];hotspots:BookHotspot[]};
export type BookState = {scene_index:number;step:number;ready:boolean;completed:boolean;paused:boolean;feedback:string;selected:string|null;request:string|null;hints:string[];assisted_scenes:string[];break_count:number;refusal_count:number;events:{id:string;action:string;scene:string}[]};
export type BookSnapshot = {definition:{key:string;version:number;title:string;subtitle:string;status:'DRAFT'|'PUBLISHED';review_note:string;audio:{status:string;clips:Record<string,string>};scenes:BookScene[]};state:BookState;revision:number;preview:boolean};
export type BookAssetManifest = {version:number;images:Record<string,{width:number;height:number;source:string}>};
