from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
base=Path('output/redesigned/Soyle_Presentation_Redesigned.pptx')
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with ZipFile(base) as z: data={n:z.read(n) for n in z.namelist()}
r=E.fromstring(data['ppt/slides/slide8.xml'])
positions={'89%':(716,467,278,90),'83%':(1018,467,278,90),'1':(744,755,170,90),'2':(923,755,170,90),'3':(1102,755,170,90),'Старт':(744,845,170,80),'≥3 результата76% / 50%':(923,845,170,80),'≥6 результатов88% / 80%':(1102,845,170,80)}
for s in r.findall('.//p:sp',ns):
 t=''.join(s.xpath('.//a:t/text()',namespaces=ns))
 if t not in positions:continue
 x,y,w,h=positions[t];xf=s.find('p:spPr/a:xfrm',ns)
 xf.find('a:off',ns).attrib.update({'x':str(round(x*9525)),'y':str(round(y*9525))})
 xf.find('a:ext',ns).attrib.update({'cx':str(round(w*9525)),'cy':str(round(h*9525))})
 body=s.find('p:txBody/a:bodyPr',ns); body.set('anchor','ctr' if '%' in t and len(t)==3 else 't')
 for el in s.xpath('.//*[@algn]',namespaces=ns):el.set('algn','ctr')
 for p in s.findall('p:txBody/a:p',ns):
  pp=p.find('a:pPr',ns)
  if pp is None:pp=E.Element('{'+ns['a']+'}pPr');p.insert(0,pp)
  pp.set('algn','ctr')
data['ppt/slides/slide8.xml']=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile('.redesign-build/aligned-draft.pptx','w',ZIP_DEFLATED) as z:
 for n,b in data.items():z.writestr(n,b)
