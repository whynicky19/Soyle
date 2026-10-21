import type { Actor } from "@/lib/storybook/cinematic/timeline";
import type { RigAsset } from "@/lib/storybook/cinematic/rig";

export function RigImage({ asset, part, x, y, width, height }: { asset: RigAsset; part: string; x: number; y: number; width: number; height: number }) {
  const frame = asset.parts[part];
  if (!frame) return null;
  return <svg x={x} y={y} width={width} height={height} viewBox={frame.box.join(" ")} overflow="hidden" preserveAspectRatio="none" aria-hidden="true"><image href={asset.url} width={asset.width} height={asset.height}/></svg>;
}

export function CharacterRig({ actor, asset }: { actor: Actor; asset: RigAsset }) {
  const joint = (name: string) => `${actor}:${name}`;
  const leg = (side: "L" | "R") => <g data-joint={joint(`leg${side}`)} transform={`translate(${side === "L" ? -20 : 20} -136)`}>
    <RigImage asset={asset} part={`thigh${side}`} x={-18} y={-8} width={36} height={86}/>
    <g data-joint={joint(`knee${side}`)} transform="translate(0 70)"><circle r={13} fill={actor === "child" ? "#ecaa70" : "#35676e"}/><RigImage asset={asset} part={`shin${side}`} x={-20} y={-10} width={40} height={84}/></g>
  </g>;
  const arm = (side: "L" | "R") => <g data-joint={joint(`arm${side}`)} transform={`translate(${side === "L" ? -35 : 35} -115)`}>
    <RigImage asset={asset} part={`upper${side}`} x={-16} y={-8} width={32} height={86}/>
    <g data-joint={joint(`elbow${side}`)} transform="translate(0 70)"><circle r={12} fill={actor === "child" ? "#ecaa70" : "#d87463"}/><RigImage asset={asset} part={`forearm${side}`} x={-16} y={-9} width={32} height={83}/><g data-joint={joint(`grip${side}`)} transform="translate(0 60)"/></g>
  </g>;
  return <g data-joint={joint("root")} data-actor={actor} aria-hidden="true">
    {leg("L")}{leg("R")}
    <g data-joint={joint("torso")} transform="translate(0 -140)">
      {arm("L")}
      <RigImage asset={asset} part="pelvis" x={-40} y={-21} width={80} height={45}/>
      <RigImage asset={asset} part="torso" x={-50} y={-132} width={100} height={133}/>
      {arm("R")}
      <g data-joint={joint("head")} transform="translate(0 -135)"><g data-joint={joint("eyes-open")}><RigImage asset={asset} part="head" x={-62} y={-128} width={124} height={139}/></g><g data-joint={joint("eyes-closed")} opacity="0"><RigImage asset={asset} part="blink" x={-62} y={-128} width={124} height={139}/></g></g>
    </g>
  </g>;
}
