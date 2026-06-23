import sys
sys.stdout.reconfigure(encoding='utf-8')
import json

with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_from_textbook.json', 'r', encoding='utf-8') as f:
    textbook = json.load(f)

with_func = sum(1 for f in textbook if f.get('function'))
with_indic = sum(1 for f in textbook if f.get('indication'))
with_song = sum(1 for f in textbook if f.get('song'))
total = len(textbook)

print(f'Textbook formulas: {total}')
print(f'With function: {with_func}')
print(f'With indication: {with_indic}')
print(f'With song: {with_song}')
print(f'Missing function: {total - with_func}')
print(f'Missing indication: {total - with_indic}')

print('\nFormulas WITHOUT function:')
for f in textbook:
    if not f.get('function'):
        print(f'  {f["name"]}')

print('\nFormulas WITHOUT indication:')
for f in textbook:
    if not f.get('indication'):
        print(f'  {f["name"]}')
