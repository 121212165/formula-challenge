import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import re

# Load textbook data
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_from_textbook.json', 'r', encoding='utf-8') as f:
    textbook = json.load(f)

# Load existing enriched data
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_enriched.json', 'r', encoding='utf-8') as f:
    existing = json.load(f)

existing_names = {f['name'] for f in existing}

# Clean formula names (fix OCR artifacts)
def clean_name(name):
    name = name.strip()
    name = name.replace('荡', '汤').replace('场', '汤')
    name = re.sub(r'\s+', '', name)  # Remove spaces
    name = name.replace('(', '（').replace(')', '）')
    # Extract main name before parentheses
    match = re.match(r'^([^（]+)', name)
    if match:
        return match.group(1)
    return name

# Category classification
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
    "吴茱萸汤", "阳和汤",
    "香砂六君子汤", "生脉散", "玉屏风散", "完带汤",
    "当归补血汤", "左归丸", "右归丸", "大补阴丸",
    "地黄饮子", "天王补心丹", "酸枣仁汤", "朱砂安神丸",
    "安宫牛黄丸", "苏合香丸", "真人养脏汤", "四神丸",
    "固冲汤", "桑螵蛸散", "枳实薤白桂枝汤",
    "半夏厚朴汤", "厚朴温中汤", "天台乌药散",
    "桃核承气汤", "桂枝茯苓丸", "十灰散", "小蓟饮子",
    "槐花散", "黄土汤", "大秦艽汤", "消风散",
    "牵正散", "羚角钩藤汤", "大定风珠", "增液汤",
    "益胃汤", "养阴清肺汤", "三仁汤", "甘露消毒丹",
    "连朴饮", "当归拈痛汤", "二妙散", "五皮散",
    "苓桂术甘汤", "萆薢分清饮", "羌活胜湿汤",
    "小活络丹", "涤痰汤", "三子养亲汤",
    "定喘汤", "苏子降气汤", "旋覆代赭汤", "橘皮竹茹汤",
    "枳实消痞丸", "健脾丸", "肥儿丸"
]

# Chapter mapping
CHAPTER_MAP = {
    "解表剂": 1, "泻下剂": 2, "和解剂": 3, "清热剂": 4, "祛暑剂": 5,
    "温里剂": 6, "表里双解剂": 7, "补益剂": 8, "固涩剂": 9, "安神剂": 10,
    "开窍剂": 11, "理气剂": 12, "理血剂": 13, "治风剂": 14, "治燥剂": 15,
    "祛湿剂": 16, "祛痰剂": 17, "消食剂": 18, "驱虫剂": 19, "涌吐剂": 20
}

# Build list of missing formulas
missing = []
for f in textbook:
    name = clean_name(f['name'])
    if name not in existing_names and name:
        # Try to determine chapter from the data
        chapter = 0
        for cat_name, cat_id in CHAPTER_MAP.items():
            if cat_name in f.get('chapter_name', ''):
                chapter = cat_id
                break
        
        # Determine level
        if name in CATEGORY_1:
            level = "一类方"
        elif name in CATEGORY_2:
            level = "二类方"
        else:
            level = "三类方"
        
        missing.append({
            'name': name,
            'chapter': chapter,
            'chapter_name': f.get('chapter_name', ''),
            'composition': f.get('composition', ''),
            'function': f.get('function', ''),
            'indication': f.get('indication', ''),
            'song': f.get('song', ''),
            'level': level
        })

print(f'Missing formulas to add: {len(missing)}')
for f in missing[:20]:
    print(f"  {f['name']} | {f['level']} | {f['function'][:40]}")

# Save missing formulas
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_missing.json', 'w', encoding='utf-8') as f_out:
    json.dump(missing, f_out, ensure_ascii=False, indent=2)
print(f'\nSaved to formulas_missing.json')
