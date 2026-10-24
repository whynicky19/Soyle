"use client";

import Image from "next/image";
import { Volume2 } from "lucide-react";
import type { InstructionScenario } from "@/lib/exerciseRuntime";

export function InstructionResult({ scenario, modelled, onSpeak, onMediaError }: {
  scenario: InstructionScenario;
  modelled: boolean;
  onSpeak: (text: string, rate?: number) => Promise<boolean>;
  onMediaError: () => void;
}) {
  const result = scenario.result;
  if (!result) return null;
  const media = result.media_ref || `/learning-cards/results/${scenario.success.object_key}-${scenario.success.target_key}.png`;
  return <figure className="instruction-result" data-relation={result.relation} aria-label={result.speech}>
    <figcaption><strong>{modelled ? "Смотрим действие вместе" : "Вот что получилось"}</strong><p>{result.speech}</p></figcaption>
    <Image src={media} alt={result.speech} width={640} height={640} sizes="(max-width:480px) 70vw, 320px" onError={onMediaError}/>
    <button className="small-button" type="button" onClick={() => void onSpeak(result.speech, .78)}><Volume2 size={17}/> Озвучить результат</button>
  </figure>;
}
