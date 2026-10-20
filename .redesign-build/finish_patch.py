from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
p=Path('.redesign-build/redesign-draft.pptx')
ns={'c':'http://schemas.openxmlformats.org/drawingml/2006/chart','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with ZipFile(p) as z: data={n:z.read(n) for n in z.namelist()}
for n,b in list(data.items()):
 if n.startswith('ppt/slides/charts/chart') and n.endswith('.xml'):
  root=E.fromstring(b)
  if root.find('.//c:doughnutChart',ns) is not None:
   for t in root.findall('.//c:title//a:t',ns):
    if t.text=='Самостоятельность': t.text='Самостоятельно'
   for el in root.findall('.//c:title//a:defRPr',ns)+root.findall('.//c:title//a:rPr',ns): el.set('sz','1900')
  if root.find('.//c:scatterChart',ns) is not None:
   for ser in root.findall('.//c:scatterChart/c:ser',ns):
    el=ser.find('c:smooth',ns)
    if el is None: el=E.SubElement(ser,'{'+ns['c']+'}smooth')
    el.set('val','0')
  data[n]=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(p,'w',ZIP_DEFLATED) as z:
 for n,b in data.items(): z.writestr(n,b)
source=Path('.redesign-build/redesign.mjs')
s=source.read_text().replace('titleTextStyle:{fontSize:23,fill:C.soft}','titleTextStyle:{fontSize:19,fill:C.soft}')
source.write_text(s)
