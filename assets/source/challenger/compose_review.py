"""Compose already-rendered evidence without altering any avatar pixels."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/evidence/challenger'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
small=ImageFont.truetype(font,18);title=ImageFont.truetype(font,30)
heads=Image.new('RGB',(1600,920),'#eee8dd');draw=ImageDraw.Draw(heads)
draw.text((24,18),'CHALLENGER / ACTUAL FITTED GLB GEOMETRY',font=title,fill='#282c3a')
draw.text((24,58),'Blender review of AvatarLibrary-loaded surfaces · front, three-quarter and both profiles',font=small,fill='#56515a')
views=['front','left-oblique','right-oblique','left-profile','right-profile']
for row,head in enumerate(['head-scout','head-spark']):
    for col,view in enumerate(views):
        im=Image.open(OUT/f'blender-{head}-{view}.png').convert('RGBA').resize((320,320),Image.Resampling.LANCZOS)
        heads.paste(im,(col*320,104+row*400),im)
        draw.text((col*320+18,432+row*400),f'{head[5:].upper()} / {view}',font=small,fill='#282c3a')
heads.save(OUT/'blender-heads.png',optimize=True)
action=Image.new('RGB',(1200,840),'#eee8dd');draw=ImageDraw.Draw(action)
draw.text((24,18),'CHALLENGER / ASSEMBLED AVATAR IN ACTION',font=title,fill='#282c3a')
draw.text((24,58),'Actual runtime run and wave snapshots · Blender review materials',font=small,fill='#56515a')
for col,(head,pose) in enumerate([('head-scout','run'),('head-spark','wave')]):
    im=Image.open(OUT/f'blender-{head}-{pose}.png').convert('RGBA')
    action.paste(im,(col*600,126),im)
    draw.text((col*600+60,766),f'{head[5:].upper()} / {pose.upper()} / Challenger grin',font=small,fill='#282c3a')
action.save(OUT/'blender-action.png',optimize=True)
