import rules from "../locales/kk-KZ-aac-rules.json" with { type: "json" };
export function composeKazakhAAC(cards: Array<{concept_key?:string}>): string | null {
  const keys=cards.map(card=>card.concept_key);
  if (![2,3].includes(keys.length)||keys.some(key=>!key)) return null;
  const intents=keys.filter(key=>key==='want'||key==='see'||key==='love');
  if (intents.length!==1) return null;
  const intent=intents[0] as 'want'|'see'|'love';
  const remaining=keys.filter(key=>key!==intent) as string[];
  let subject='me';
  if (remaining.length===2) { if (!(remaining[0] in rules.subjects))return null; subject=remaining.shift()!; }
  if (remaining.length===1 && intent==='want' && subject==='me' && remaining[0] in rules.activities)return rules.activities[remaining[0] as keyof typeof rules.activities];
  if (remaining.length!==1||!(remaining[0] in rules.objects))return null;
  const actor=rules.subjects[subject as keyof typeof rules.subjects];
  const object=rules.objects[remaining[0] as keyof typeof rules.objects];
  return intent==='want'?`${actor.dat} ${object.nom} керек.`:`${actor.nom} ${object.acc} ${actor[intent]}.`;
}
