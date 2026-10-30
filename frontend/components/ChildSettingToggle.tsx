"use client";
import { useId } from 'react';
export function ChildSettingToggle({title,description,value,disabled=false,onChange}: {title:string;description?:string;value:boolean;disabled?:boolean;onChange:(value:boolean)=>void}) {
  const id = useId();
  return <div className="child-setting-row"><div><label id={id}>{title}</label>{description && <p id={`${id}-hint`}>{description}</p>}</div><button type="button" role="switch" aria-checked={value} aria-labelledby={id} aria-describedby={description?`${id}-hint`:undefined} className="child-switch" disabled={disabled} onClick={() => onChange(!value)}><span aria-hidden="true"/></button></div>;
}
