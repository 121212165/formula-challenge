import sys
sys.stdout.reconfigure(encoding='utf-8')
import docx
import json
import re

doc = docx.Document(r'C:\Users\lenovo\Desktop\文档\（已压缩）方剂学.docx')
text = '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
lines = text.split('\n')

formulas = []
for i, line in enumerate(lines):
    if '【组成】' in line:
        # Formula name is 2 lines before 【组成】
        name = lines[i-2].strip() if i >= 2 else ''
        # Skip if name looks like a source reference or too long
        if not name or len(name) > 15 or name.startswith('《') or name.startswith('凡以'):
            # Try 1 line before
            name = lines[i-1].strip() if i >= 1 else ''
        if not name or len(name) > 15 or name.startswith('《'):
            continue
        
        comp = line.replace('【组成】', '').strip()
        func = ''
        indica = ''
        song = ''
        for j in range(i+1, min(i+20, len(lines))):
            if '【功效】' in lines[j] or '【功用】' in lines[j]:
                func = lines[j].replace('【功效】', '').replace('【功用】', '').strip()
            elif '【主治】' in lines[j]:
                indica = lines[j].replace('【主治】', '').strip()
            elif '【方歌】' in lines[j]:
                song = lines[j].replace('【方歌】', '').strip()
            elif '【组成】' in lines[j]:
                break
        
        if name:
            formulas.append({
                'name': name,
                'composition': comp[:500],
                'function': func[:300],
                'indication': indica[:500],
                'song': song[:300]
            })

print(f'Total formulas found: {len(formulas)}')
for f in formulas[:30]:
    print(f"{f['name']} | {f['function']} | {f['indication'][:60]}")

with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_from_textbook.json', 'w', encoding='utf-8') as f:
    json.dump(formulas, f, ensure_ascii=False, indent=2)
print(f'\nSaved to formulas_from_textbook.json')
