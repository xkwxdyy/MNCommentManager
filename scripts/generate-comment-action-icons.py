"""Render the addon's compact line icons; no external fonts or packages beyond Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]/'src/action-icons'
ROOT.mkdir(exist_ok=True)
(ROOT/'dark').mkdir(exist_ok=True)
S=12
for name in ['manager','add','organize','batch','down','edit','multi','select-all','clear','more','up','undo','close','copy','extract','fold','expand','workflow','settings','link','unlink','trash','html','excerpt','back','check','extension','title','empty']:
 im=Image.new('RGBA',(24*S,24*S));d=ImageDraw.Draw(im);ink='#b93236' if name in ['trash','title'] else '#2860d8';w=round(1.8*S)
 def line(points):d.line([(round(x*S),round(y*S)) for x,y in points],fill=ink,width=w,joint='curve')
 def rect(box,r=2):d.rounded_rectangle(tuple(round(v*S) for v in box),radius=round(r*S),outline=ink,width=w)
 def ellipse(box):d.ellipse(tuple(round(v*S) for v in box),outline=ink,width=w)
 def tick(x,y):line([(x,y),(x+2,y+2),(x+6,y-3)])
 if name in ['manager','add','batch']:
  if name=='batch':rect((7,3,22,16));line([(19,16),(19,20),(15,16)]);rect((2,7,17,21));line([(5,21),(5,23),(8,21)])
  else:
   rect((3,3,21,18));line([(3,15),(3,22),(8,18)])
   if name=='add':line([(8,10),(16,10)]);line([(12,6),(12,14)])
   else:
    for y,x in [(7,16),(11,17),(15,13)]:line([(7,y),(x,y)])
 elif name in ['organize','select-all']:
  for y in [6,12,18]:tick(3,y);line([(12,y),(21,y)])
 elif name in ['multi','check','clear','empty']:
  rect((3,3,21,21));line([(7,12),(11,16),(18,8)]) if name not in ['clear','empty'] else line([(7,12),(17,12)]) if name=='clear' else None
 elif name in ['down','up','back']:
  line([(6,9),(12,15),(18,9)] if name=='down' else [(6,15),(12,9),(18,15)] if name=='up' else [(14,5),(7,12),(14,19)])
 elif name=='edit':
  line([(4,17),(16,5),(20,9),(8,21),(3,22),(4,17)]);line([(13,8),(17,12)])
 elif name=='undo':line([(8,5),(3,10),(8,15)]);line([(3,10),(15,10),(20,12),(21,16),(19,20),(11,20)])
 elif name=='close':line([(6,6),(18,18)]);line([(18,6),(6,18)])
 elif name=='copy':rect((8,8,21,21));line([(16,4),(3,4),(3,17)])
 elif name=='extract':line([(4,4),(4,12),(20,12)]);line([(14,6),(20,12),(14,18)])
 elif name in ['fold','expand']:
  line([(5,4),(12,10),(19,4)] if name=='fold' else [(5,9),(12,3),(19,9)]);line([(5,20),(12,14),(19,20)] if name=='fold' else [(5,15),(12,21),(19,15)])
 elif name=='more':
  for x in [5,12,19]:ellipse((x-1,11,x+1,13))
 elif name=='workflow':rect((3,3,9,9));rect((15,15,21,21));line([(9,6),(18,6),(18,15)])
 elif name=='settings':
  for y,x in [(5,8),(12,16),(19,10)]:line([(3,y),(21,y)]);rect((x-2,y-2,x+2,y+2),1)
 elif name in ['link','unlink']:
  line([(10,7),(14,3),(18,3),(21,6),(21,10),(16,15)]);line([(14,17),(10,21),(6,21),(3,18),(3,14),(8,9)]);line([(8,16),(16,8)])
  if name=='unlink':line([(2,2),(22,22)])
 elif name=='trash':line([(3,6),(21,6)]);line([(6,6),(7,21),(17,21),(18,6)]);line([(9,3),(15,3)]);line([(10,10),(10,17)]);line([(14,10),(14,17)])
 elif name in ['html','excerpt','title']:
  if name=='title':line([(4,4),(20,4)]);line([(12,4),(12,20)]);line([(7,20),(17,20)])
  else:
   rect((4,2,20,22));line([(8,7),(16,7)])
   if name=='html':line([(10,11),(7,14),(10,17)]);line([(14,11),(17,14),(14,17)])
   else:line([(8,12),(16,12)]);line([(8,17),(13,17)])
 elif name=='extension':rect((4,4,20,20));line([(8,9),(16,9)]);line([(12,5),(12,13)])
 bitmap=im.resize((72,72),Image.Resampling.LANCZOS)
 bitmap.save(ROOT/(name+'.png'))
 dark=Image.new('RGBA',bitmap.size,'#ffb4ae' if name in ['trash','title'] else '#a7c5ff')
 dark.putalpha(bitmap.getchannel('A'))
 dark.save(ROOT/'dark'/(name+'.png'))
print('Rendered',len(list(ROOT.rglob('*.png'))),'action icons')
