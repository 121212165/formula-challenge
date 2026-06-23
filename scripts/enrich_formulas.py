import sys
sys.stdout.reconfigure(encoding='utf-8')
import json

# Load textbook data
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_from_textbook.json', 'r', encoding='utf-8') as f:
    textbook = json.load(f)

# Load existing data
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_parsed.json', 'r', encoding='utf-8') as f:
    existing = json.load(f)

# Create lookup by name
textbook_map = {}
for f in textbook:
    name = f['name'].strip()
    if name:
        textbook_map[name] = f

existing_map = {}
for f in existing:
    name = f['name'].strip()
    if name:
        existing_map[name] = f

# 一类方/二类方/三类方分类 (考研通用标准)
CATEGORY_1 = [
    "麻黄汤", "桂枝汤", "小青龙汤", "银翘散", "桑菊饮",
    "麻黄杏仁甘草石膏汤", "败毒散", "大承气汤", "温脾汤",
    "小柴胡汤", "逍遥散", "半夏泻心汤", "白虎汤", "清营汤",
    "犀角地黄汤", "导赤散", "龙胆泻肝汤", "清胃散", "芍药汤",
    "白头翁汤", "青蒿鳖甲汤", "理中丸", "小建中汤", "四逆汤",
    "当归四逆汤", "四君子汤", "参苓白术散", "补中益气汤",
    "四物汤", "归脾汤", "六味地黄丸", "一贯煎", "肾气丸",
    "炙甘草汤", "平胃散", "藿香正气散", "茵陈蒿汤", "八正散",
    "五苓散", "真武汤", "独活寄生汤", "二陈汤", "温胆汤",
    "半夏白术天麻汤", "保和丸", "乌梅丸", "越鞠丸", "血府逐瘀汤",
    "补阳还五汤", "生化汤", "川芎茶调散", "镇肝熄风汤",
    "杏苏散", "清燥救肺汤", "麦门冬汤", "百合固金汤"
]

CATEGORY_2 = [
    "九味羌活汤", "香苏散", "止嗽散", "柴葛解肌汤", "升麻葛根汤",
    "参苏饮", "麻黄细辛附子汤", "加减葳蕤汤", "大青龙汤",
    "大柴胡汤", "蒿芩清胆汤", "四逆散", "痛泻要方",
    "竹叶石膏汤", "黄连解毒汤", "普济消毒饮", "仙方活命饮",
    "当归六黄汤", "六一散", "清骨散", "左金丸",
    "大黄附子汤", "麻子仁丸", "济川煎", "十枣汤", "黄龙汤",
    "增液承气汤", "小陷胸汤", "三物备急丸",
    "吴茱萸汤", "四逆汤", "当归四逆汤", "阳和汤",
    "香砂六君子汤", "生脉散", "玉屏风散", "完带汤",
    "当归补血汤", "左归丸", "右归丸", "大补阴丸",
    "地黄饮子", "天王补心丹", "酸枣仁汤", "朱砂安神丸",
    "安宫牛黄丸", "苏合香丸", "真人养脏汤", "四神丸",
    "固冲汤", "桑螵蛸散", "越鞠丸", "枳实薤白桂枝汤",
    "半夏厚朴汤", "厚朴温中汤", "天台乌药散",
    "桃核承气汤", "桂枝茯苓丸", "十灰散", "小蓟饮子",
    "槐花散", "黄土汤", "大秦艽汤", "消风散",
    "牵正散", "羚角钩藤汤", "大定风珠", "增液汤",
    "益胃汤", "养阴清肺汤", "三仁汤", "甘露消毒丹",
    "连朴饮", "当归拈痛汤", "二妙散", "五皮散",
    "苓桂术甘汤", "萆薢分清饮", "羌活胜湿汤",
    "小活络丹", "涤痰汤", "三子养亲汤", "止嗽散",
    "定喘汤", "苏子降气汤", "旋覆代赭汤", "橘皮竹茹汤",
    "枳实消痞丸", "健脾丸", "肥儿丸"
]

# Build enriched list
enriched = []
matched = 0
unmatched = []

for f in existing:
    name = f['name'].strip()
    textbook_data = textbook_map.get(name, {})
    
    # Determine level
    if name in CATEGORY_1:
        level = "一类方"
    elif name in CATEGORY_2:
        level = "二类方"
    else:
        level = "三类方"
    
    # Merge data - textbook takes precedence for empty fields
    enriched_formula = {
        'id': f.get('id', ''),
        'chapter': f.get('chapter', 0),
        'chapter_name': f.get('chapter_name', ''),
        'name': name,
        'mnemonic': f.get('mnemonic', ''),
        'trigger': f.get('trigger', ''),
        'mnemonic_explanation': textbook_data.get('function', '') or f.get('mnemonic_explanation', ''),
        'traditional_mnemonic': textbook_data.get('song', '') or f.get('traditional_mnemonic', ''),
        'traditional_mnemonic_explanation': f.get('traditional_mnemonic_explanation', ''),
        'ingredients': textbook_data.get('composition', '') or f.get('ingredients', ''),
        'functions': textbook_data.get('function', '') or f.get('functions', ''),
        'indications': textbook_data.get('indication', '') or f.get('indications', ''),
        'level': level
    }
    
    if textbook_data:
        matched += 1
    
    enriched.append(enriched_formula)

# Check for formulas in textbook but not in existing
for name in textbook_map:
    if name not in existing_map:
        unmatched.append(name)

print(f'Enriched: {len(enriched)} formulas')
print(f'Matched with textbook: {matched}')
print(f'Category 1: {sum(1 for f in enriched if f["level"] == "一类方")}')
print(f'Category 2: {sum(1 for f in enriched if f["level"] == "二类方")}')
print(f'Category 3: {sum(1 for f in enriched if f["level"] == "三类方")}')
print(f'In textbook but not in DB: {len(unmatched)}')
if unmatched:
    print('Missing formulas:', unmatched[:20])

# Save enriched data
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_enriched.json', 'w', encoding='utf-8') as f:
    json.dump(enriched, f, ensure_ascii=False, indent=2)
print('\nSaved to formulas_enriched.json')
