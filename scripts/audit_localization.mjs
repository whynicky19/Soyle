/** Source inventory, not a language detector. Never rewrites pedagogical/scoring data. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const root=path.resolve(import.meta.dirname,'..');
const findings=[];
function scan(dir) {
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()) { scan(file); continue; }
  if(!/\.tsx?$/.test(file))continue;
  const source=fs.readFileSync(file,'utf8');
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node) {
   if((ts.isJsxText(node)||ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)) && /[А-Яа-яЁё]/.test(node.text)) {
    findings.push({file:path.relative(root,file),line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,text:node.text.trim(),kind:ts.SyntaxKind[node.kind]});
   }
   ts.forEachChild(node,visit);
  }
  visit(sf);
 }
}
for(const dir of ['frontend/components','frontend/lib','frontend/app'])scan(path.join(root,dir));
fs.writeFileSync(path.join(root,'docs/localization/remaining-strings.json'),JSON.stringify(findings,null,2)+'\n');
const counts={};for(const item of findings)counts[item.file]=(counts[item.file]??0)+1;
console.log(JSON.stringify({occurrences:findings.length,files:Object.keys(counts).length,largest:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10)},null,2));
if(process.argv.includes('--check')&&findings.length)process.exitCode=1;
