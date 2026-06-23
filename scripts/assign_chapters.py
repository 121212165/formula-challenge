import sys
sys.stdout.reconfigure(encoding='utf-8')
import json

# Load missing formulas
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_missing.json', 'r', encoding='utf-8') as f:
    missing = json.load(f)

# Manual chapter assignment based on formula names
CHAPTER_ASSIGNMENTS = {
    # 解表剂
    "大青龙汤": 1, "香苏散": 1, "麻黄杏仁甘草石膏汤": 1, "升麻葛根汤": 1,
    "葱豉桔梗汤": 1, "再造散": 1, "麻黄细辛附子汤": 1, "葱白七味饮": 1,
    # 泻下剂
    "五仁丸": 2, "禹功散": 2,
    # 和解剂
    "达原饮": 3,
    # 清热剂
    "凉隔散": 4, "左金九": 4, "清络饮": 4, "葛根黄芩黄连汤": 4,
    "五味消毒饮": 4, "四妙勇安汤": 4, "犀黄丸": 4,
    # 祛暑剂
    "桂苓甘露散": 5,
    # 温里剂
    "五积散": 6,
    # 补益剂
    "博济方》": 8, "泰山磐石散": 8, "二至丸": 8, "益胃汤": 8,
    "龟鹿二仙胶": 8, "七宝美髯丹": 8, "数太平惠民和刺局方》": 8,
    # 固涩剂
    "桃花汤": 9, "驻车丸": 9, "缩泉丸": 9, "固经丸": 9,
    # 安神剂
    "磁朱丸": 10, "桂枝甘草龙骨牡蛎汤": 10, "甘麦大枣汤": 10,
    "养心汤": 10, "交泰丸": 10, "黄连阿胶汤": 10, "抱龙丸": 10,
    # 理气剂
    "柴胡疏肝散": 12, "金铃子散": 12, "瓜蒌薤白白酒汤": 12,
    "积实消痞丸": 12, "圣济思录》": 12, "橘核丸": 12,
    "加味乌药汤": 12, "橘皮竹茹汤": 12, "丁香柿蒂汤": 12,
    # 理血剂
    "七厘散": 13, "大黄鏖虫丸": 13,
    # 治风剂
    "阿胶鸡子黄汤": 14,
    # 治燥剂
    "养阴清肺汤": 15, "琼玉膏": 15, "玉液汤": 15,
    # 祛湿剂
    "连朴饮": 16, "当归拈痛汤": 16, "二妙散": 16, "五皮散": 16,
    "萆藤分清饮": 16, "茯苓丸": 16,
    # 祛痰剂
    "贝母瓜萎散": 17, "定痫丸": 17,
    # 消食剂
    "木香槟榔丸": 18, "葛花解醒汤": 18,
    # 涌吐剂
    "参芦饮": 20,
    # 外科
    "牛蒡解肌汤": 4, "消瘰丸": 17, "内补黄芪汤": 8,
}

# Update chapter assignments
for f in missing:
    if f['name'] in CHAPTER_ASSIGNMENTS:
        f['chapter'] = CHAPTER_ASSIGNMENTS[f['name']]

# Save updated missing formulas
with open(r'C:\Users\lenovo\Desktop\workspace-95fd097d\data\formulas_missing.json', 'w', encoding='utf-8') as f_out:
    json.dump(missing, f_out, ensure_ascii=False, indent=2)

print(f'Updated {len(missing)} formulas with chapter assignments')
assigned = sum(1 for f in missing if f['chapter'] > 0)
print(f'Assigned chapters: {assigned}')
print(f'Still missing chapters: {len(missing) - assigned}')
