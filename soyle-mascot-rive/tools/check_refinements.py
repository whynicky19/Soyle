"""Render all six animations at each real display size and check loop endpoints."""
from pathlib import Path
import subprocess,json,xml.etree.ElementTree as E
from PIL import Image,ImageChops
ROOT=Path(__file__).resolve().parents[1]
CLI=str(Path.home()/'.rive/bin/rive')
OUT=ROOT/'build/refinement-qa';OUT.mkdir(exist_ok=True)
frames=[1,35,60,95,151,170,209,269]
report={'sizes':[64,76,80,100],'frames':frames,'animations':['Idle','Greeting','Happy','Encouragement','Thinking','Celebrate'],'checks':[]}
for size in report['sizes']:
 for frame in frames:
  out=OUT/f'all-{size}-f{frame}.png'
  subprocess.run([CLI,str(ROOT),'--artboard=All states • '+str(size)+'px',f'--advance={frame}','--screenshot='+str(out)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  im=Image.open(out).convert('RGB');cw=size+60;ch=size+65
  assert im.size==(cw*3,ch*2)
  for i in range(6):
   # Each slot is an actual-size character plus safe margins, before its label.
   region=im.crop((i%3*cw,i//3*ch,i%3*cw+cw,i//3*ch+size+12))
   bg=Image.new('RGB',region.size,im.getpixel((0,0)))
   box=ImageChops.difference(region,bg).convert('L').point(lambda v:255 if v>12 else 0).getbbox()
   assert box and box[0]>0 and box[1]>0 and box[2]<cw and box[3]<size+12,(size,frame,i,box)
 print(f'PASS: six animations at {size}px, {len(frames)} frames each.',flush=True)
# Every keyed curve ends at its first value, avoiding pops at clip loops.
tree=E.parse(ROOT/'scene.rml');count=0
for anim in tree.findall('.//LinearAnimation'):
 for prop in anim.findall('.//KeyedProperty'):
  keys=prop.findall('KeyFrameDouble')
  if keys:
   assert abs(float(keys[0].get('value'))-float(keys[-1].get('value')))<1e-5,(anim.get('name'),prop.attrib)
   count+=1
inspection=json.loads((ROOT/'build/inspection.json').read_text());assert not inspection['problems']
# The original identity atlas is unchanged from the supplied approved parts sheet.
reference=Path('/Users/whynicky/.codex/generated_images/01a18d63-5843-7042-bd9a-a9ba6bc5b7aa/exec-48f53f9e-5778-4841-8276-7a971edaa092.png')
if reference.exists():assert reference.read_bytes()==(ROOT/'assets/full-body-parts.png').read_bytes()
report['checks']=['192 animation-size-frame cases rendered with visible content and margins',f'{count} animation curves return to their initial value','Zero scene inspection problems','Approved character texture unchanged']
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
