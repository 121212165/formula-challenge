// 腧穴种子数据入库脚本(Phase 2)
// 用法: DATABASE_URL=... DIRECT_URL=... npx tsx scripts/seed-acupoints-db.ts
// 幂等:经络按 name 唯一、穴位按 code 唯一跳过;重复执行安全
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// 十四经
const MERIDIANS: { name: string; code: string; sortOrder: number }[] = [
  { name: "手太阴肺经", code: "LU", sortOrder: 1 },
  { name: "手阳明大肠经", code: "LI", sortOrder: 2 },
  { name: "足阳明胃经", code: "ST", sortOrder: 3 },
  { name: "足太阴脾经", code: "SP", sortOrder: 4 },
  { name: "手少阴心经", code: "HT", sortOrder: 5 },
  { name: "手太阳小肠经", code: "SI", sortOrder: 6 },
  { name: "足太阳膀胱经", code: "BL", sortOrder: 7 },
  { name: "足少阴肾经", code: "KI", sortOrder: 8 },
  { name: "手厥阴心包经", code: "PC", sortOrder: 9 },
  { name: "手少阳三焦经", code: "TE", sortOrder: 10 },
  { name: "足少阳胆经", code: "GB", sortOrder: 11 },
  { name: "足厥阴肝经", code: "LR", sortOrder: 12 },
  { name: "督脉", code: "GV", sortOrder: 13 },
  { name: "任脉", code: "CV", sortOrder: 14 },
];

// 24 个常用经穴(数据整理自《针灸学》教材公开内容,供学习参考)
const SEED_ACUPOINTS: {
  id: string;
  name: string;
  pinyin: string;
  code: string;
  meridian: string;
  location: string;
  indications: string;
  method: string;
  special: string;
  caution: string;
  mnemonic: string;
  mnemonicExplanation: string;
  level: string;
  sortOrder: number;
}[] = [
  { id: "a_lieque", name: "列缺", pinyin: "lieque", code: "LU7", meridian: "手太阴肺经", location: "前臂桡侧缘,桡骨茎突上方,腕横纹上1.5寸", indications: "咳嗽,气喘,咽喉肿痛,偏正头痛,项强", method: "向上斜刺0.3-0.5寸", special: "络穴;八脉交会穴(通任脉)", caution: "", mnemonic: "头项寻列缺", mnemonicExplanation: "列缺为四总穴之一,善治头项部疾患", level: "一类", sortOrder: 1 },
  { id: "a_chize", name: "尺泽", pinyin: "chize", code: "LU5", meridian: "手太阴肺经", location: "肘横纹中,肱二头肌腱桡侧凹陷处", indications: "咳嗽,气喘,咯血,潮热,咽喉肿痛,肘臂挛痛", method: "直刺0.8-1.2寸;或点刺出血", special: "合穴", caution: "", mnemonic: "尺泽清肺泄热", mnemonicExplanation: "尺泽为肺经合穴,善清肺泻热", level: "二类", sortOrder: 2 },
  { id: "a_hegu", name: "合谷", pinyin: "hegu", code: "LI4", meridian: "手阳明大肠经", location: "手背,第1、2掌骨间,第2掌骨桡侧的中点处", indications: "头痛,目赤肿痛,齿痛,口眼歪斜,发热恶寒,经闭,滞产", method: "直刺0.5-1寸", special: "原穴", caution: "孕妇禁针", mnemonic: "面口合谷收", mnemonicExplanation: "合谷为四总穴之一,善治头面口齿诸疾", level: "一类", sortOrder: 3 },
  { id: "a_quchi", name: "曲池", pinyin: "quchi", code: "LI11", meridian: "手阳明大肠经", location: "屈肘成直角,肘横纹外侧端与肱骨外上髁连线中点", indications: "热病,咽喉肿痛,手臂肿痛,瘾疹,高血压,腹痛吐泻", method: "直刺1-1.5寸", special: "合穴", caution: "", mnemonic: "曲池清解热毒", mnemonicExplanation: "曲池为清热要穴,善治热病与皮肤病", level: "一类", sortOrder: 4 },
  { id: "a_zusanli", name: "足三里", pinyin: "zusanli", code: "ST36", meridian: "足阳明胃经", location: "小腿前外侧,犊鼻下3寸,胫骨前嵴外一横指", indications: "胃痛,呕吐,腹胀,泄泻,痢疾,便秘,虚劳羸瘦,下肢痿痹", method: "直刺1-2寸;强壮保健要穴", special: "合穴;胃下合穴", caution: "", mnemonic: "肚腹三里留", mnemonicExplanation: "足三里为四总穴之一,善治胃肠病,又为保健要穴", level: "一类", sortOrder: 5 },
  { id: "a_tianshu", name: "天枢", pinyin: "tianshu", code: "ST25", meridian: "足阳明胃经", location: "腹部,脐中旁开2寸", indications: "腹胀肠鸣,绕脐痛,便秘,泄泻,痢疾,月经不调", method: "直刺1-1.5寸", special: "大肠募穴", caution: "", mnemonic: "天枢调畅肠腑", mnemonicExplanation: "天枢为大肠募穴,善调肠腑气机", level: "一类", sortOrder: 6 },
  { id: "a_sanyinjiao", name: "三阴交", pinyin: "sanyinjiao", code: "SP6", meridian: "足太阴脾经", location: "小腿内侧,内踝尖上3寸,胫骨内侧缘后际", indications: "月经不调,痛经,带下,遗精,遗尿,失眠,下肢痿痹", method: "直刺1-1.5寸", special: "足三阴经交会穴", caution: "孕妇禁针", mnemonic: "三阴交调经血", mnemonicExplanation: "三阴交为肝脾肾三经交会,善治妇科诸疾", level: "一类", sortOrder: 7 },
  { id: "a_xuehai", name: "血海", pinyin: "xuehai", code: "SP10", meridian: "足太阴脾经", location: "屈膝,髌底内侧端上2寸,股内侧肌隆起处", indications: "月经不调,痛经,经闭,瘾疹,湿疹,丹毒", method: "直刺1-1.5寸", special: "", caution: "", mnemonic: "血海调血祛风", mnemonicExplanation: "血海善调血分,为治血证与皮肤病要穴", level: "一类", sortOrder: 8 },
  { id: "a_shenmen", name: "神门", pinyin: "shenmen", code: "HT7", meridian: "手少阴心经", location: "腕横纹尺侧端,尺侧腕屈肌腱的桡侧凹陷处", indications: "心痛,心烦,惊悸,怔忡,健忘,失眠,癫痫", method: "直刺0.3-0.5寸", special: "原穴;输穴", caution: "", mnemonic: "神门安神定志", mnemonicExplanation: "神门为心经原穴,善宁心安神", level: "一类", sortOrder: 9 },
  { id: "a_houxi", name: "后溪", pinyin: "houxi", code: "SI3", meridian: "手太阳小肠经", location: "微握拳,第5掌指关节尺侧后方,掌横纹头赤白肉际", indications: "头项强痛,腰背痛,手指挛痛,目赤,耳聋,癫狂痫", method: "直刺0.5-1寸", special: "输穴;八脉交会穴(通督脉)", caution: "", mnemonic: "后溪通督止项痛", mnemonicExplanation: "后溪通督脉,善治头项腰背痛", level: "一类", sortOrder: 10 },
  { id: "a_weizhong", name: "委中", pinyin: "weizhong", code: "BL40", meridian: "足太阳膀胱经", location: "腘横纹中点,当股二头肌腱与半腱肌腱的中间", indications: "腰背痛,下肢痿痹,腹痛吐泻,小便不利,丹毒", method: "直刺1-1.5寸;或点刺出血", special: "合穴;膀胱下合穴", caution: "", mnemonic: "腰背委中求", mnemonicExplanation: "委中为四总穴之一,善治腰背疾患", level: "一类", sortOrder: 11 },
  { id: "a_chengshan", name: "承山", pinyin: "chengshan", code: "BL57", meridian: "足太阳膀胱经", location: "小腿后面正中,委中与昆仑之间,伸直小腿或足跟上提时腓肠肌肌腹下尖角凹陷处", indications: "腰腿拘急疼痛,小腿转筋,痔疾,便秘", method: "直刺1-2寸", special: "", caution: "", mnemonic: "承山舒筋治痔", mnemonicExplanation: "承山善治小腿转筋与痔疾", level: "二类", sortOrder: 12 },
  { id: "a_jingming", name: "睛明", pinyin: "jingming", code: "BL1", meridian: "足太阳膀胱经", location: "目内眦角稍上方凹陷处", indications: "目赤肿痛,流泪,视物不明,近视,夜盲,色盲", method: "嘱患者闭目,医者轻推眼球向外侧固定,紧靠眶缘缓慢直刺0.5-1寸", special: "", caution: "禁灸;不宜提插捻转", mnemonic: "睛明善疗目疾", mnemonicExplanation: "睛明为治眼病要穴", level: "二类", sortOrder: 13 },
  { id: "a_yongquan", name: "涌泉", pinyin: "yongquan", code: "KI1", meridian: "足少阴肾经", location: "足底前1/3与后2/3交界处凹陷中,蜷足时足前部凹陷处", indications: "头痛,眩晕,失眠,昏厥,癫狂,咽喉肿痛,小便不利", method: "直刺0.5-1寸;可灸", special: "井穴", caution: "", mnemonic: "涌泉开窍苏厥", mnemonicExplanation: "涌泉为肾经井穴,善开窍苏厥,引火下行", level: "一类", sortOrder: 14 },
  { id: "a_taixi", name: "太溪", pinyin: "taixi", code: "KI3", meridian: "足少阴肾经", location: "内踝尖与跟腱之间的凹陷处", indications: "头痛目眩,耳鸣耳聋,咽喉肿痛,失眠,遗精阳痿,腰脊痛", method: "直刺0.5-1寸", special: "原穴;输穴", caution: "", mnemonic: "太溪补肾滋阴", mnemonicExplanation: "太溪为肾经原穴,善滋阴补肾", level: "一类", sortOrder: 15 },
  { id: "a_neiguan", name: "内关", pinyin: "neiguan", code: "PC6", meridian: "手厥阴心包经", location: "前臂掌侧,腕横纹上2寸,掌长肌腱与桡侧腕屈肌腱之间", indications: "心痛,心悸,胸闷,胃痛,呕吐,呃逆,失眠,眩晕", method: "直刺0.5-1寸", special: "络穴;八脉交会穴(通阴维脉)", caution: "", mnemonic: "内关心胸要穴", mnemonicExplanation: "内关善治心胸胃诸疾,为护心要穴", level: "一类", sortOrder: 16 },
  { id: "a_waiguan", name: "外关", pinyin: "waiguan", code: "TE5", meridian: "手少阳三焦经", location: "前臂背侧,腕背横纹上2寸,尺骨与桡骨之间", indications: "热病,头痛,目赤肿痛,耳鸣耳聋,胁肋痛,上肢痹痛", method: "直刺0.5-1寸", special: "络穴;八脉交会穴(通阳维脉)", caution: "", mnemonic: "外关解表退热", mnemonicExplanation: "外关为退热要穴,善治外感热病", level: "一类", sortOrder: 17 },
  { id: "a_fengchi", name: "风池", pinyin: "fengchi", code: "GB20", meridian: "足少阳胆经", location: "项部,枕骨之下,胸锁乳突肌与斜方肌上端之间的凹陷处", indications: "头痛,眩晕,颈项强痛,目赤肿痛,感冒,中风,癫痫", method: "针尖向鼻尖方向斜刺0.8-1.2寸", special: "", caution: "深部为延髓,忌深刺", mnemonic: "风池祛风通络", mnemonicExplanation: "风池善祛风邪,为治头风眩晕要穴", level: "一类", sortOrder: 18 },
  { id: "a_yanglingquan", name: "阳陵泉", pinyin: "yanglingquan", code: "GB34", meridian: "足少阳胆经", location: "小腿外侧,腓骨头前下方凹陷处", indications: "胁肋痛,口苦,呕吐,下肢痿痹,膝肿痛,筋脉拘挛", method: "直刺1-1.5寸", special: "合穴;筋会", caution: "", mnemonic: "阳陵筋会舒筋", mnemonicExplanation: "阳陵泉为八会穴之筋会,善治筋病", level: "一类", sortOrder: 19 },
  { id: "a_taichong", name: "太冲", pinyin: "taichong", code: "LR3", meridian: "足厥阴肝经", location: "足背,第1、2跖骨结合部前方凹陷处", indications: "头痛,眩晕,目赤肿痛,胁痛,郁证,月经不调,癫痫", method: "直刺0.5-0.8寸", special: "原穴;输穴", caution: "", mnemonic: "太冲平肝降逆", mnemonicExplanation: "太冲为肝经原穴,善平肝潜阳,疏肝理气", level: "一类", sortOrder: 20 },
  { id: "a_baihui", name: "百会", pinyin: "baihui", code: "GV20", meridian: "督脉", location: "头顶正中线与两耳尖连线的交点处", indications: "头痛,眩晕,失眠,健忘,中风失语,脱肛,阴挺,久泻", method: "平刺0.5-0.8寸;可灸", special: "督脉与足太阳经交会穴", caution: "", mnemonic: "百会升阳举陷", mnemonicExplanation: "百会为诸阳之会,善升阳举陷,醒脑开窍", level: "一类", sortOrder: 21 },
  { id: "a_dazhui", name: "大椎", pinyin: "dazhui", code: "GV14", meridian: "督脉", location: "后正中线上,第7颈椎棘突下凹陷中", indications: "热病,疟疾,咳嗽气喘,头项强痛,癫痫,骨蒸潮热", method: "斜刺0.5-1寸;可灸", special: "诸阳之会", caution: "", mnemonic: "大椎退热主表", mnemonicExplanation: "大椎为诸阳经交会穴,为退热要穴", level: "一类", sortOrder: 22 },
  { id: "a_guanyuan", name: "关元", pinyin: "guanyuan", code: "CV4", meridian: "任脉", location: "下腹部,前正中线上,脐中下3寸", indications: "遗精,阳痿,遗尿,小便频数,月经不调,虚劳羸瘦,腹痛泄泻", method: "直刺1-1.5寸;多用灸法", special: "小肠募穴;任脉与足三阴经交会穴", caution: "孕妇禁针", mnemonic: "关元培元固本", mnemonicExplanation: "关元为补肾培元要穴,多用灸法温补", level: "一类", sortOrder: 23 },
  { id: "a_zhongwan", name: "中脘", pinyin: "zhongwan", code: "CV12", meridian: "任脉", location: "上腹部,前正中线上,脐中上4寸", indications: "胃痛,腹胀,呕吐,呃逆,食积,泄泻,纳呆", method: "直刺1-1.5寸;可灸", special: "胃募穴;腑会", caution: "", mnemonic: "中脘和胃降逆", mnemonicExplanation: "中脘为胃募穴、腑会,善治胃肠诸疾", level: "一类", sortOrder: 24 },
];

async function main() {
  // 1. 建经络(幂等:name 唯一)
  const meridianIdMap = new Map<string, number>();
  for (const m of MERIDIANS) {
    const existing = await db.meridian.findUnique({ where: { name: m.name } });
    if (existing) {
      meridianIdMap.set(m.name, existing.id);
      continue;
    }
    const created = await db.meridian.create({
      data: { name: m.name, code: m.code, sortOrder: m.sortOrder, description: "" },
    });
    meridianIdMap.set(m.name, created.id);
  }
  console.log(`✅ 经络就绪(${meridianIdMap.size} 条)`);

  // 2. 插入穴位(幂等:code 唯一跳过)
  let inserted = 0;
  let skipped = 0;
  for (const p of SEED_ACUPOINTS) {
    const meridianId = meridianIdMap.get(p.meridian);
    if (!meridianId) throw new Error(`经络缺失: ${p.meridian}`);
    const existing = await db.acupoint.findUnique({ where: { code: p.code } });
    if (existing) {
      skipped++;
      continue;
    }
    await db.acupoint.create({
      data: {
        id: p.id,
        name: p.name,
        pinyin: p.pinyin,
        code: p.code,
        meridianId,
        location: p.location,
        indications: p.indications,
        method: p.method,
        special: p.special,
        caution: p.caution,
        mnemonic: p.mnemonic,
        mnemonicExplanation: p.mnemonicExplanation,
        level: p.level,
        sortOrder: p.sortOrder,
      },
    });
    inserted++;
  }
  console.log(`✅ 腧穴种子完成:新增 ${inserted} 穴,跳过 ${skipped} 穴(已存在)`);

  const total = await db.acupoint.count();
  console.log(`📊 生产库当前腧穴总数: ${total} 穴`);
}

main()
  .catch((e) => {
    console.error("❌ 种子失败:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
