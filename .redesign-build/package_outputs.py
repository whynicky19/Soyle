from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image,ImageOps,ImageDraw,ImageFont
from pypdf import PdfReader
import shutil
base=Path('output/redesigned'); assets=base/'presentation_assets'; previews=Path('.redesign-build/pdf-previews')
files=sorted(previews.glob('slide-*.png'))
assert len(files)==17
for f in files: shutil.copy2(f,assets/'slide_previews'/f.name)
w,h=640,360; pad=24; label=34; columns=3; rows=6
sheet=Image.new('RGB',(columns*w+(columns+1)*pad, rows*(h+label)+(rows+1)*pad),'#E8EDF4')
d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
 x=pad+(i%columns)*(w+pad); y=pad+(i//columns)*(h+label+pad)
 sheet.paste(Image.open(f).resize((w,h),Image.Resampling.LANCZOS),(x,y))
 d.text((x,y+h+8),f'{i+1:02d}',fill='#263449')
sheet.save(base/'Soyle_Presentation_Contact_Sheet.png')
(assets/'README.txt').write_text('SÖYLE — BEYOND WORDS\nМатериалы презентации от 18.10.2026\n\n*-hi.png — реальные снимки локального демо Söyle в высоком разрешении.\nОстальные продуктовые PNG — фрагменты этих экранов; функции не дорисованы.\nДемонстрационные профили не являются данными реальных детей.\nfamily-hero.webp — иллюстративный материал из frontend/public/landing проекта.\nsoyle-icon.png — фирменный значок проекта.\nreact, next, fastapi, postgresql — официальные значки технологий.\nИсточники: react.dev/favicon.ico; nextjs.org/favicon.ico; fastapi.tiangolo.com/img/favicon.png; postgresql.org/media/img/about/press/elephant.png.\n\nslide_previews/ — все 17 финальных слайдов.\ndesign_studies/ — три концепции (6 слайдов PPTX и PNG), аудит старой версии, storyboard и бизнес-анализ.\n\nТексты, схемы и 5 диаграмм в главном PPTX редактируемые. Интерфейсы и фотографии — растровые изображения.\nТарифы и финансовые сценарии — гипотезы, не действующие продажи.\n',encoding='utf8')
with ZipFile(base/'Soyle_Presentation_Assets.zip','w',ZIP_DEFLATED) as z:
 for f in sorted(assets.rglob('*')):
  if f.is_file():z.write(f,f.relative_to(base))
with ZipFile(base/'Soyle_Presentation_Redesigned.pptx') as z:
 names=z.namelist()
 print('PPTX:',sum(n.startswith('ppt/slides/slide') and n.endswith('.xml') for n in names),'slides;',sum(n.startswith('ppt/embeddings/') and n.endswith('.xlsx') for n in names),'editable chart workbooks')
print('PDF:',len(PdfReader(base/'Soyle_Presentation_Redesigned.pdf').pages),'pages')
with ZipFile(base/'Soyle_Presentation_Assets.zip') as z: assert z.testzip() is None; print('Assets:',len(z.namelist()),'files')
for p in base.glob('*'):
 if p.is_file(): print(p.name,p.stat().st_size)
