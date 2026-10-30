"""Söyle full-body pet: native Rive cutout rig using an unmodified 3D parts atlas."""
from pathlib import Path
import base64, math, sys, xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parents[1]
serial=0

def el(parent,tag,**attrs):
 global serial
 serial+=1;attrs.setdefault('id',f'0:{serial}')
 return E.SubElement(parent,tag,{k:str(v) for k,v in attrs.items()})
def ref(e):return e.attrib['id']
def track(anim,obj,prop,keys):
 ko=el(anim,'KeyedObject',objectId=ref(obj));kp=el(ko,'KeyedProperty',property=prop)
 for keyindex,(frame,value) in enumerate(keys):
  k=el(kp,'KeyFrameDouble',frame=frame,value=f'{value:.6f}',interpolationType='cubic')
  curve=('.42','0','.58','1')
  if obj.attrib.get('name')=='Pet root • ground pivot' and prop=='y' and keyindex+1<len(keys):
   delta=keys[keyindex+1][1]-value
   if delta < -4:curve=('0','0','.35','1')
   elif delta > 4:curve=('.55','0','1','1')
  el(k,'CubicEaseInterpolator',x1=curve[0],y1=curve[1],x2=curve[2],y2=curve[3])
def crop(parent,name,box,pivot,scale=1):
 node=el(parent,'Node',name=name,scaleX=scale,scaleY=scale)
 im=el(node,'Image',assetId=ref(asset),name=name+' painted layer')
 mesh=el(im,'Mesh',name=name+' UV crop',triangleIndexBytes='AAECAAID')
 x0,y0,x1,y1=box
 for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]:
  el(mesh,'ContourMeshVertex',x=x-pivot[0],y=y-pivot[1],u=x/1536,v=y/1024)
 return node
r=E.Element('Rive',version='1',kind='fragment')
asset=el(r,'ImageAsset',file='assets/full-body-parts.png',name='Söyle full-body 3D painted parts')
mouthAsset=el(r,'ImageAsset',file='assets/beak-expressions.png',name='Matching beak expressions')
font=el(r,'FontAsset',file='assets/review-labels.ttf',name='Review labels')
ab=el(r,'Artboard',width=200,height=220,name='Söyle • Full-body pet',isComponent='true',x=0,y=0)
st=el(ab,'LayoutComponentStyle',name='Transparent pet bounds');ab.set('styleId',ref(st))
root=el(ab,'Node',x=100,y=205,name='Pet root • ground pivot')
# First-declared layers draw in front. All part pivots are independently keyed.
def varint(n):
 b=[]
 while n>127:b.append((n&127)|128);n>>=7
 return bytes(b+[n])
def imagequad(parent,assetref,box,target,dimensions=(1536,1024),name='Painted expression'):
 im=el(parent,'Image',assetId=ref(assetref),name=name)
 m=el(im,'Mesh',triangleIndexBytes='AAECAAID',name=name+' UV')
 a,b,c,d=box;x0,y0,x1,y1=target
 for (px,py),(x,y) in zip([(a,b),(c,b),(c,d),(a,d)],[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]):
  el(m,'ContourMeshVertex',x=x,y=y,u=px/dimensions[0],v=py/dimensions[1])
 return im

def cream(parent,x,y,w,h,name):
 sh=el(parent,'Shape',x=x,y=y,name=name)
 el(sh,'Ellipse',width=w,height=h)
 f=el(sh,'Fill');g=el(f,'LinearGradient',startX=0,startY=-h/2,endX=0,endY=h/2)
 if 'mouth' in name:
  for pos,color in [(0,'FFFDF8E6'),(.25,'FFFDF6E5'),(.5,'FFFEF7E4'),(.75,'FFFEF6E2'),(1,'FFFCF0DA')]:el(g,'GradientStop',position=pos,colorValue=color)
 else:
  el(g,'GradientStop',position=0,colorValue='FFFEF6E3');el(g,'GradientStop',position=1,colorValue='FFFEF8E5')
 return sh

head=el(root,'Node',x=0,y=-69,name='Head • neck pivot')
face=el(head,'Node',scaleX='.205',scaleY='.205',name='Face • original identity')
# Each eye uses the original pixels. Blinks compress the eye layer, not the face.
gaze=el(face,'Node',name='Gaze micro-movement')
eyes=[];eyeMood=[]
for cx,cy,rx,ry in [(207,426,51,62),(439,438,49,63)]:
 moodEye=el(gaze,'Node',x=cx-310,y=cy-600,name='Eye expression');eyeMood.append(moodEye)
 eye=el(moodEye,'Node',name='Blink eyelid travel');eyes.append(eye)
 im=el(eye,'Image',assetId=ref(asset),name='Original glossy eye')
 tri=[]
 for i in range(48):tri.extend([i,(i+1)%48,48])
 mesh=el(im,'Mesh',triangleIndexBytes=base64.b64encode(bytes(tri)).decode(),name='Eye ellipse cutout')
 for i in range(48):
  theta=2*math.pi*i/48;x=rx*math.cos(theta);y=ry*math.sin(theta)
  el(mesh,'ContourMeshVertex',x=x,y=y,u=(cx+x)/1536,v=(cy+y)/1024)
 el(mesh,'MeshVertex',x=0,y=0,u=cx/1536,v=cy/1024)
# Beaks are localized replacements, never an alternate head design.
beaks=[]
for i,(name,box,w,h) in enumerate([
 ('Neutral • closed',(162,87,625,423),124,90),
 ('Happy • original smile',(252,420,388,557),136,137),
 ('Surprised • small O',(183,555,606,916),120,108),
 ('Encouraging • gentle smile',(910,567,1358,893),124,90)]):
 n=el(face,'Node',opacity=1 if i==0 else 0,name=name);beaks.append(n)
 # Top edge remains fixed, preserving placement between the original eyes.
 imagequad(n,asset if i==1 else mouthAsset,box,(10-w/2,-180,10+w/2,-180+h),name=name)
cream(face,10,-110,160,174,'Cream under original mouth')
# Covers sit behind the moving eye layers and use the local face colors.
for cx,cy,w,h in [(207,426,110,132),(439,438,106,134)]:cream(face,cx-310,cy-600,w,h,'Cream under eye')
headart=crop(head,'Head artwork',(15,28,595,640),(310,600),.205)
# Soft contact shading and torso overlap unify the original head and body.
neck=el(root,'Shape',x=0,y=-62,scaleY='.15',name='Soft neck contact shading')
el(neck,'Ellipse',width=48,height=48)
nf=el(neck,'Fill');ng=el(nf,'RadialGradient',startX=0,startY=0,endX=24,endY=0)
for pos,color in [(0,'40324E4E'),(.35,'24324E4E'),(1,'00324E4E')]:el(ng,'GradientStop',position=pos,colorValue=color)
# The shadow sits behind the original head, in front of the torso.
root.remove(neck);root.insert(1,neck)
body=el(root,'Node',x=0,y=-42,scaleY='1.04',name='Body • breathing pivot')
crop(body,'Rounded torso',(620,230,1125,635),(874,435),.16)
wingverts={}
def wing(parent,side,box,pivot):
 n=el(parent,'Node',scaleX='.138',scaleY='.122',name=side+' rounded flipper')
 im=el(n,'Image',assetId=ref(asset),name=side+' original painted wing')
 x0,y0,x1,y1=box
 coords=[(x0+(x1-x0)*i/6,y0+(y1-y0)*j/6) for j in range(7) for i in range(7)]
 # Perimeter first, in clockwise order, so the mesh remains editor compatible.
 order=[i for i in range(7)]+[j*7+6 for j in range(1,7)]+[42+i for i in range(5,-1,-1)]+[j*7 for j in range(5,0,-1)]
 order += [j*7+i for j in range(1,6) for i in range(1,6)]
 inv={n:i for i,n in enumerate(order)};tri=[]
 for j in range(6):
  for i in range(6):
   a=j*7+i;b=a+1;c=a+8;d=a+7;tri += [inv[a],inv[b],inv[c],inv[a],inv[c],inv[d]]
 mesh=el(im,'Mesh',triangleIndexBytes=base64.b64encode(bytes(tri)).decode(),name=side+' flexible tip')
 vv=[]
 for idx,idx0 in enumerate(order):
  px,py=coords[idx0];x=px-pivot[0];y=py-pivot[1]
  v=el(mesh,'ContourMeshVertex' if idx<24 else 'MeshVertex',x=x,y=y,u=px/1536,v=py/1024)
  vv.append((v,x,y))
 wingverts[side]=vv
 return n
left=el(root,'Node',x=-25,y=-65,name='Left wing • shoulder pivot');wing(left,'Left',(1190,268,1500,615),(1415,305))
right=el(root,'Node',x=25,y=-65,name='Right wing • shoulder pivot');wing(right,'Right',(115,655,455,990),(200,690))
lf=el(root,'Node',x=-22,y=-12,name='Left foot • ankle pivot');crop(lf,'Left golden foot',(592,734,960,958),(775,775),.105)
rf=el(root,'Node',x=22,y=-12,name='Right foot • ankle pivot');crop(rf,'Right golden foot',(1126,734,1490,958),(1305,775),.105)

# Main preview sequences six calm animations; isolation machines loop each.
names=['Idle','Greeting','Happy','Encouragement','Thinking','Celebrate']
durations=[300,210,180,240,270,210]
show=el(ab,'StateMachine',name='Showcase');ab.set('defaultStateMachineId',ref(show))
layer=el(show,'StateMachineLayer',name='Six calm expressions')
el(layer,'AnyState',x=0,y=-160);el(layer,'ExitState',x=300,y=-160)
entry=el(layer,'EntryState',x=0,y=0)
sequence=[0,1,0,2,3,4,5]
states=[el(layer,'AnimationState',x=200+i*200,y=0,reset='true') for i in range(len(sequence))]
el(entry,'StateTransition',stateToId=ref(states[0]))
for i,s in enumerate(states):el(s,'StateTransition',stateToId=ref(states[(i+1)%len(states)]),enableExitTime='true',exitTimeIsPercetange='true',exitTime=100,duration=150)
machines=[]
for name in names+['Still']:
 sm=el(ab,'StateMachine',name=name);l=el(sm,'StateMachineLayer',name=name)
 el(l,'AnyState',x=0,y=-150);el(l,'ExitState',x=260,y=-150)
 e=el(l,'EntryState',x=0,y=0);s=el(l,'AnimationState',x=200,y=0,reset='true')
 el(e,'StateTransition',stateToId=ref(s));machines.append((sm,s))
# A reusable data-driven controller, separate from the automatic review show.
vm=el(r,'ViewModel',name='SoylePet')
mode=el(vm,'ViewModelPropertyNumber',name='mood')
instance=el(vm,'ViewModelInstance',name='Default',exports='true')
el(instance,'ViewModelInstanceNumber',viewModelPropertyId=ref(mode),propertyValue=0)
vm.set('defaultInstanceId',ref(instance));ab.set('viewModelId',ref(vm));ab.set('viewModelInstanceId',ref(instance))
controller=el(ab,'StateMachine',name='Companion')
cl=el(controller,'StateMachineLayer',name='Mood selector')
el(cl,'AnyState',x=0,y=-160);el(cl,'ExitState',x=300,y=-160)
ce=el(cl,'EntryState',x=0,y=0)
cs=[el(cl,'AnimationState',x=220+i%3*240,y=i//3*240,reset='true') for i in range(6)]
el(ce,'StateTransition',stateToId=ref(cs[0]))
for i,source in enumerate(cs):
 for j,destination in enumerate(cs):
  if i==j:continue
  tr=el(source,'StateTransition',stateToId=ref(destination),duration=180)
  condition=el(tr,'TransitionViewModelCondition',opValue='equal')
  comp=el(condition,'TransitionPropertyViewModelComparator');bp=el(comp,'BindablePropertyNumber')
  el(bp,'DataBindContext',sourcePathIds=ref(vm)+'-'+ref(mode),propertyKey=636)
  el(condition,'TransitionValueNumberComparator',value=j)
# Reset every controlled property in every clip, allowing clean crossfades.
base=[(root,'x',100),(root,'y',205),(root,'scaleX',1),(root,'scaleY',1),(root,'rotation',0),
 (head,'x',0),(head,'y',-69),(head,'rotation',0),(head,'scaleX',1),(head,'scaleY',1),
 (body,'scaleX',1),(body,'scaleY',1.04),(left,'rotation',0),(right,'rotation',0),
 (lf,'rotation',0),(rf,'rotation',0),(lf,'y',-12),(rf,'y',-12),(gaze,'x',0),(gaze,'y',0),(neck,'y',-62)]
base += [(e,'scaleY',1) for e in eyes] + [(e,'scaleY',1) for e in eyeMood] + [(e,'opacity',1 if i==0 else 0) for i,e in enumerate(beaks)]
animations=[]
for k,name in enumerate(names):
 d=durations[k];a=el(ab,'LinearAnimation',name=name,fps=60,duration=d,loopValue='loop');animations.append(a);machines[k][1].set('animationId',ref(a))
 keys={(ref(o),p):[(0,v),(d,v)] for o,p,v in base}
 def setkeys(o,p,values):keys[(ref(o),p)]=values
 setkeys(body,'scaleY',[(0,1.04),(d//2,1.06),(d,1.04)])
 setkeys(body,'scaleX',[(0,1),(d//2,1.012),(d,1)])
 setkeys(head,'y',[(0,-69),(d//2,-70),(d,-69)])
 bt=[(0,0),(116,0),(121,1),(124,1),(132,0),(d,0)]
 if k==0:
  bt=[(0,0),(146,0),(150,1),(152,1),(160,0),(256,0),(260,1),(262,1),(270,0),(d,0)]
  setkeys(left,'rotation',[(0,0),(150,.025),(d,0)]);setkeys(right,'rotation',[(0,0),(150,-.025),(d,0)])
 if k==1:
  setkeys(left,'rotation',[(0,0),(30,.88),(47,1.24),(69,.82),(91,1.18),(112,.88),(132,1.02),(163,0),(d,0)])
  setkeys(head,'rotation',[(0,0),(30,.045),(110,.045),(155,0),(d,0)])
  setkeys(root,'rotation',[(0,0),(32,.025),(120,.025),(160,0),(d,0)])
 if k==2:
  setkeys(head,'y',[(0,-69),(20,-67.5),(34,-70.5),(52,-70),(72,-67.8),(83,-66.8),(97,-69.6),(119,-69),(d,-69)])
  setkeys(root,'y',[(0,205),(20,207),(37,196),(48,194),(65,205),(74,207),(90,204),(110,205),(d,205)])
  setkeys(body,'scaleY',[(0,1.04),(20,.985),(39,1.065),(58,1.04),(77,1.005),(103,1.04),(d,1.04)])
  setkeys(left,'rotation',[(0,0),(30,.35),(55,.45),(90,0),(d,0)])
  setkeys(right,'rotation',[(0,0),(30,-.35),(55,-.45),(90,0),(d,0)])
 if k==3:
  setkeys(head,'rotation',[(0,0),(38,-.10),(80,-.10),(115,-.04),(155,0),(d,0)])
  setkeys(head,'y',[(0,-69),(42,-69),(60,-67),(78,-70),(100,-68),(125,-69),(d,-69)])
  setkeys(left,'rotation',[(0,0),(35,.18),(95,.18),(145,0),(d,0)])
  bt=[(0,0),(50,0),(56,1),(62,1),(72,0),(d,0)]
 if k==4:
  setkeys(gaze,'x',[(0,0),(42,-5),(170,-5),(215,0),(d,0)])
  setkeys(gaze,'y',[(0,0),(42,-4),(170,-4),(215,0),(d,0)])
  setkeys(head,'rotation',[(0,0),(42,.13),(105,.13),(140,.07),(175,.13),(215,0),(d,0)])
  setkeys(head,'x',[(0,0),(42,1.6),(180,1.6),(220,0),(d,0)])
  setkeys(right,'rotation',[(0,0),(46,-1.68),(133,-1.68),(172,-1.57),(210,0),(d,0)])
  bt=[(0,0),(162,0),(166,1),(168,1),(177,0),(d,0)]
 if k==5:
  setkeys(head,'y',[(0,-69),(24,-67.5),(44,-70),(65,-69),(85,-66.8),(104,-69.8),(130,-69),(d,-69)])
  setkeys(root,'y',[(0,205),(24,208),(43,191),(56,190),(77,205),(88,208),(105,204),(126,205),(d,205)])
  setkeys(root,'scaleY',[(0,1),(24,.95),(39,1.018),(56,1),(88,.965),(108,1.012),(130,1),(d,1)])
  setkeys(root,'scaleX',[(0,1),(24,1.035),(39,.975),(56,1),(88,1.025),(130,1),(d,1)])
  setkeys(left,'rotation',[(0,0),(24,.25),(45,1.23),(68,1.12),(100,.4),(135,0),(d,0)])
  setkeys(right,'rotation',[(0,0),(24,-.25),(49,-1.20),(72,-1.10),(100,-.4),(135,0),(d,0)])
  setkeys(lf,'rotation',[(0,0),(42,.13),(65,.10),(80,0),(d,0)]);setkeys(rf,'rotation',[(0,0),(42,-.13),(65,-.10),(80,0),(d,0)])
  bt=[(0,0),(88,0),(93,1),(96,1),(104,0),(d,0)]
 # Eye close is fast, reopening slower. No face fading or head replacement.
 for eyei,e in enumerate(eyes):setkeys(e,'scaleY',[(min(d,t+(eyei if 0<t<d else 0)),1-.94*v) for t,v in bt])
 # Four actual mouth poses, local to the existing beak position.
 expression=[(0,0),(d,0)]
 if k==1:expression=[(0,0),(18,0),(27,3),(138,3),(158,0),(d,0)]
 if k==2:expression=[(0,0),(10,0),(20,1),(100,1),(126,0),(d,0)]
 if k==3:expression=[(0,0),(16,0),(28,3),(174,3),(198,0),(d,0)]
 if k==4:expression=[(0,0),(d,0)]
 if k==5:expression=[(0,0),(12,0),(23,2),(43,2),(53,1),(126,1),(151,0),(d,0)]
 for i,e in enumerate(beaks):setkeys(e,'opacity',[(t,1 if j==i else 0) for t,j in expression])
 if k==3:
  for e in eyeMood:setkeys(e,'scaleY',[(0,1),(35,.93),(170,.93),(205,1),(d,1)])
 if k==5:
  for e in eyeMood:setkeys(e,'scaleY',[(0,1),(23,1.07),(44,1.07),(58,1),(d,1)])
 # The neck contact shading follows the head at reduced amplitude.
 setkeys(neck,'y',[(t,-62+(v+69)*.5) for t,v in keys[(ref(head),'y')]])
 # A short lag and soft tip flex prevent the flippers behaving like rigid paddles.
 for side,pivot in [('Left',left),('Right',right)]:
  values=keys[(ref(pivot),'rotation')]
  flex=[(0,0)]+[(min(d,t+5),angle*.085) for t,angle in values if 0<t<d]+[(d,0)]
  for v,x,y in wingverts[side]:
   w=max(0,min(1,(y-25)/240));w=w*w*(3-2*w)
   if w==0:continue
   for axis,prop in enumerate(['x','y']):
    positions=[]
    for t,angle in flex:
     bend=angle*w
     pos=(x*math.cos(bend)-y*math.sin(bend),x*math.sin(bend)+y*math.cos(bend))
     positions.append((t,pos[axis]))
    track(a,v,prop,positions)
 for obj,prop,val in base:track(a,obj,prop,keys[(ref(obj),prop)])
for s,a in zip(cs,animations):s.set('animationId',ref(a))
for s,k in zip(states,sequence):s.set('animationId',ref(animations[k]))
still=el(ab,'LinearAnimation',name='Still',duration=60,loopValue='loop');machines[-1][1].set('animationId',ref(still))
if '--still' in sys.argv:ab.set('defaultStateMachineId',ref(machines[-1][0]))
el(r,'ComponentAsset',name='Söyle full-body pet',artboardId=ref(ab))
control=el(r,'Artboard',width=200,height=220,name='Interactive pet',x=0,y=280,viewModelId=ref(vm),viewModelInstanceId=ref(instance))
st=el(control,'LayoutComponentStyle',name='Transparent bounds');control.set('styleId',ref(st))
ns=el(control,'NestedArtboard',artboardId=ref(ab),name='Pet')
el(ns,'NestedStateMachine',animationId=ref(controller),name='Companion')
# The parent also needs a running machine to propagate its data bindings.
sm=el(control,'StateMachine',name='Data context');control.set('defaultStateMachineId',ref(sm))
lay=el(sm,'StateMachineLayer',name='Context');ent=el(lay,'EntryState',x=0,y=0)
el(lay,'AnyState',x=0,y=-150);ex=el(lay,'ExitState',x=240,y=0)
el(ent,'StateTransition',stateToId=ref(ex))
# Native artboards allow isolation and true-size checks with no UI container.
for i,(name,size,sm) in enumerate([(n,220,ref(machines[j][0])) for j,n in enumerate(names+['Still'])]+[(f'Size check • {s}px',s,ref(show)) for s in [64,76,80,100]]):
 b=el(r,'Artboard',width=size,height=size,name=name,x=260+i*260,y=0)
 st=el(b,'LayoutComponentStyle',name='Transparent bounds');b.set('styleId',ref(st))
 nest=el(b,'NestedArtboard',artboardId=ref(ab),x=size/22,scaleX=size/220,scaleY=size/220,name='Independent pet')
 el(nest,'NestedStateMachine',animationId=sm,name='Playback')
# Review-only artboards show all six animations together; companion remains unframed.
review_y=600
for size,title in [(180,'Motion review'),(64,'All states • 64px'),(76,'All states • 76px'),(80,'All states • 80px'),(100,'All states • 100px')]:
 cellw=size+60;cellh=size+65
 board=el(r,'Artboard',width=3*cellw,height=2*cellh,name=title,x=0,y=review_y);review_y+=2*cellh+50
 st=el(board,'LayoutComponentStyle',name='Review bounds');board.set('styleId',ref(st))
 for i,name in enumerate(names):
  c=i%3;row=i//3;x=c*cellw+30+(size-200*size/220)/2;y=row*cellh+10
  nest=el(board,'NestedArtboard',artboardId=ref(ab),x=x,y=y,scaleX=size/220,scaleY=size/220,name=name)
  el(nest,'NestedStateMachine',animationId=ref(machines[i][0]),name=name+' live')
  label=el(board,'Text',x=c*cellw+cellw/2,y=row*cellh+size+18,sizingValue='autoWidth',originX='.5',name=name+' label')
  sty=el(label,'TextStylePaint',fontSize=14 if size==180 else 11,fontAssetId=ref(font),name='Label')
  fill=el(sty,'Fill');el(fill,'SolidColor',colorValue='FFF5F1E7')
  el(label,'TextValueRun',styleId=ref(sty),text=name)

E.indent(r)
tmp=ROOT/'scene.rml.tmp';E.ElementTree(r).write(tmp,encoding='unicode');tmp.replace(ROOT/'scene.rml')
print('Generated refined pet: 4 beak expressions, traveling eyelids, flexible wings, 6 animations, 18 artboards.')
