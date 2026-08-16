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
  // ===== 数据扩充(2026-08 第二批,补齐十四经常用穴) =====
  { id: "a_zhongfu", name: "中府", pinyin: "zhongfu", code: "LU1", meridian: "手太阴肺经", location: "胸前壁外上方,前正中线旁开6寸,平第1肋间隙处", indications: "咳嗽,气喘,胸满痛,肩背痛", method: "向外斜刺或平刺0.5-0.8寸", special: "肺募穴", caution: "不可向内深刺,防伤肺脏", mnemonic: "中府肺募止咳", mnemonicExplanation: "中府为肺之募穴,善止咳平喘", level: "二类", sortOrder: 25 },
  { id: "a_taiyuan", name: "太渊", pinyin: "taiyuan", code: "LU9", meridian: "手太阴肺经", location: "腕掌侧横纹桡侧,桡动脉搏动处", indications: "咳嗽,气喘,咯血,腕臂痛,无脉症", method: "避开桡动脉,直刺0.3-0.5寸", special: "输穴;原穴;脉会", caution: "避开桡动脉", mnemonic: "太渊脉会理气", mnemonicExplanation: "太渊为肺经原穴、八会穴之脉会,善调肺气", level: "二类", sortOrder: 26 },
  { id: "a_yinlingquan", name: "阴陵泉", pinyin: "yinlingquan", code: "SP9", meridian: "足太阴脾经", location: "小腿内侧,胫骨内侧髁后下方凹陷处", indications: "腹胀,泄泻,水肿,黄疸,小便不利,膝痛", method: "直刺1-2寸", special: "合穴", caution: "", mnemonic: "阴陵利水除湿", mnemonicExplanation: "阴陵泉为利水除湿要穴,善治水肿小便不利", level: "二类", sortOrder: 27 },
  { id: "a_taibai", name: "太白", pinyin: "taibai", code: "SP3", meridian: "足太阴脾经", location: "足内侧缘,第1跖骨小头后下方赤白肉际凹陷处", indications: "胃痛,腹胀,肠鸣,泄泻,便秘,体重节痛", method: "直刺0.5-0.8寸", special: "输穴;原穴", caution: "", mnemonic: "太白健脾运化", mnemonicExplanation: "太白为脾经原穴,善健脾化湿", level: "二类", sortOrder: 28 },
  { id: "a_shaohai", name: "少海", pinyin: "shaohai", code: "HT3", meridian: "手少阴心经", location: "屈肘,肘横纹内侧端与肱骨内上髁连线的中点处", indications: "心痛,肘臂挛痛,瘰疬,头项痛", method: "直刺0.5-1寸", special: "合穴", caution: "", mnemonic: "少海清心安神", mnemonicExplanation: "少海为心经合穴,善清心安神", level: "二类", sortOrder: 29 },
  { id: "a_tongli", name: "通里", pinyin: "tongli", code: "HT5", meridian: "手少阴心经", location: "前臂掌侧,尺侧腕屈肌腱的桡侧缘,腕横纹上1寸", indications: "心悸,怔忡,暴喑,舌强不语,腕臂痛", method: "直刺0.3-0.5寸", special: "络穴", caution: "", mnemonic: "通里宁心开音", mnemonicExplanation: "通里为心经络穴,善治心悸与暴喑失语", level: "二类", sortOrder: 30 },
  { id: "a_tinggong", name: "听宫", pinyin: "tinggong", code: "SI19", meridian: "手太阳小肠经", location: "面部,耳屏前,下颌骨髁状突的后方,张口时呈凹陷处", indications: "耳鸣,耳聋,聤耳,齿痛,面痛", method: "张口,直刺0.5-1寸", special: "", caution: "留针时嘱患者勿张口", mnemonic: "听宫聪耳开窍", mnemonicExplanation: "听宫为治耳病要穴,善开窍聪耳", level: "二类", sortOrder: 31 },
  { id: "a_kunlun", name: "昆仑", pinyin: "kunlun", code: "BL60", meridian: "足太阳膀胱经", location: "足踝区,外踝尖与跟腱之间的凹陷处", indications: "头痛,项强,腰骶疼痛,足踝肿痛,难产", method: "直刺0.5-0.8寸", special: "经穴", caution: "孕妇禁针", mnemonic: "昆仑舒筋止痛", mnemonicExplanation: "昆仑善治头项腰背及足踝疾患", level: "二类", sortOrder: 32 },
  { id: "a_shenmai", name: "申脉", pinyin: "shenmai", code: "BL62", meridian: "足太阳膀胱经", location: "踝区,外踝尖直下,外踝下缘与跟骨之间凹陷处", indications: "头痛,眩晕,癫狂痫,失眠,腰腿酸痛,足外翻", method: "直刺0.3-0.5寸", special: "八脉交会穴(通阳跷脉)", caution: "", mnemonic: "申脉通跷安神", mnemonicExplanation: "申脉通阳跷脉,善治失眠癫狂与肢体活动不利", level: "二类", sortOrder: 33 },
  { id: "a_zhaohai", name: "照海", pinyin: "zhaohai", code: "KI6", meridian: "足少阴肾经", location: "踝区,内踝尖下1寸,内踝下缘边际凹陷处", indications: "失眠,癫痫,咽干咽痛,目赤肿痛,小便不利,月经不调", method: "直刺0.5-0.8寸", special: "八脉交会穴(通阴跷脉)", caution: "", mnemonic: "照海滋肾利咽", mnemonicExplanation: "照海通阴跷脉,善治咽干失眠与妇科病", level: "二类", sortOrder: 34 },
  { id: "a_daling", name: "大陵", pinyin: "daling", code: "PC7", meridian: "手厥阴心包经", location: "腕掌侧横纹中点处,当掌长肌腱与桡侧腕屈肌腱之间", indications: "心痛,心悸,胃痛,呕吐,癫狂,腕关节痛", method: "直刺0.3-0.5寸", special: "输穴;原穴", caution: "", mnemonic: "大陵宁心和胃", mnemonicExplanation: "大陵为心包经原穴,善宁心和胃", level: "二类", sortOrder: 35 },
  { id: "a_zhongzhu", name: "中渚", pinyin: "zhongzhu", code: "TE3", meridian: "手少阳三焦经", location: "手背,第4、5掌骨间,掌指关节后方凹陷处", indications: "头痛,目赤,耳鸣耳聋,咽喉肿痛,手指不能屈伸", method: "直刺0.3-0.5寸", special: "输穴", caution: "", mnemonic: "中渚清窍聪耳", mnemonicExplanation: "中渚善清头面之热,为治耳鸣要穴", level: "二类", sortOrder: 36 },
  { id: "a_jianjing", name: "肩井", pinyin: "jianjing", code: "GB21", meridian: "足少阳胆经", location: "肩胛区,第7颈椎棘突与肩峰最外侧点连线的中点", indications: "肩背痹痛,手臂不举,颈项强痛,乳痈,难产", method: "直刺0.5-0.8寸", special: "", caution: "深部为肺尖,不可深刺;孕妇禁针", mnemonic: "肩井通络止痛", mnemonicExplanation: "肩井善治肩颈疾患,为治乳痈要穴", level: "二类", sortOrder: 37 },
  { id: "a_huantiao", name: "环跳", pinyin: "huantiao", code: "GB30", meridian: "足少阳胆经", location: "臀区,股骨大转子最凸点与骶管裂孔连线的外1/3与内2/3交点处", indications: "腰胯疼痛,下肢痿痹,半身不遂,坐骨神经痛", method: "直刺2-3寸", special: "", caution: "深部邻近坐骨神经,宜缓慢进针", mnemonic: "环跳通下肢痿", mnemonicExplanation: "环跳为治下肢痿痹要穴", level: "一类", sortOrder: 38 },
  { id: "a_xuanzhong", name: "悬钟", pinyin: "xuanzhong", code: "GB39", meridian: "足少阳胆经", location: "小腿外侧,外踝尖上3寸,腓骨前缘", indications: "颈项强痛,胸胁胀痛,下肢痿痹,痴呆,中风", method: "直刺0.5-0.8寸", special: "髓会", caution: "", mnemonic: "悬钟髓会强骨", mnemonicExplanation: "悬钟为八会穴之髓会,善治颈项与下肢病", level: "二类", sortOrder: 39 },
  { id: "a_qimen", name: "期门", pinyin: "qimen", code: "LR14", meridian: "足厥阴肝经", location: "胸部,第6肋间隙,前正中线旁开4寸", indications: "胸胁胀痛,呕吐,呃逆,乳痈,郁证", method: "斜刺或平刺0.5-0.8寸", special: "肝募穴", caution: "不可深刺,防伤肝肺", mnemonic: "期门疏肝解郁", mnemonicExplanation: "期门为肝之募穴,善疏肝理气", level: "二类", sortOrder: 40 },
  { id: "a_renzhong", name: "人中", pinyin: "renzhong", code: "GV26", meridian: "督脉", location: "面部,人中沟的上1/3与中1/3交点处", indications: "昏迷,晕厥,中暑,癫狂痫,面瘫,腰脊强痛", method: "向上斜刺0.3-0.5寸", special: "", caution: "", mnemonic: "人中开窍醒神", mnemonicExplanation: "人中为急救要穴,善开窍醒神", level: "二类", sortOrder: 41 },
  { id: "a_mingmen", name: "命门", pinyin: "mingmen", code: "GV4", meridian: "督脉", location: "后正中线上,第2腰椎棘突下凹陷中", indications: "腰脊强痛,下肢痿痹,遗精阳痿,月经不调,五更泄泻", method: "直刺0.5-1寸;多用灸法", special: "", caution: "", mnemonic: "命门培元固本", mnemonicExplanation: "命门为补肾壮阳要穴,多用灸法", level: "二类", sortOrder: 42 },
  { id: "a_danzhong", name: "膻中", pinyin: "danzhong", code: "CV17", meridian: "任脉", location: "胸部,前正中线上,平第4肋间,两乳头连线的中点", indications: "胸闷气短,心悸,心痛,咳嗽气喘,乳少,呃逆", method: "平刺0.3-0.5寸", special: "心包募穴;气会", caution: "", mnemonic: "膻中宽胸理气", mnemonicExplanation: "膻中为气会,善理气宽胸,为治气病要穴", level: "二类", sortOrder: 43 },
  { id: "a_qihai", name: "气海", pinyin: "qihai", code: "CV6", meridian: "任脉", location: "下腹部,前正中线上,脐中下1.5寸", indications: "腹痛,泄泻,便秘,遗尿,遗精阳痿,月经不调,虚脱", method: "直刺1-1.5寸;多用灸法", special: "肓之原", caution: "孕妇禁针", mnemonic: "气海补气要穴", mnemonicExplanation: "气海为补气要穴,善治气虚下陷诸证", level: "二类", sortOrder: 44 },
  { id: "a_tiantu", name: "天突", pinyin: "tiantu", code: "CV22", meridian: "任脉", location: "颈前区,胸骨上窝中央,前正中线上", indications: "咳嗽,气喘,咽喉肿痛,梅核气,暴喑,瘿气", method: "先直刺0.2寸,再沿胸骨柄后缘向下刺1-1.5寸", special: "", caution: "严格掌握进针方向与深度,防伤大血管", mnemonic: "天突利咽平喘", mnemonicExplanation: "天突善利咽下气,为治咳喘要穴", level: "二类", sortOrder: 45 },
  { id: "a_shangjuxu", name: "上巨虚", pinyin: "shangjuxu", code: "ST37", meridian: "足阳明胃经", location: "小腿前外侧,犊鼻下6寸,胫骨前嵴外一横指", indications: "肠鸣,腹痛,泄泻,便秘,肠痈,下肢痿痹", method: "直刺1-2寸", special: "大肠下合穴", caution: "", mnemonic: "上巨调肠下合", mnemonicExplanation: "上巨虚为大肠下合穴,善治肠腑诸疾", level: "二类", sortOrder: 46 },
  { id: "a_neiting", name: "内庭", pinyin: "neiting", code: "ST44", meridian: "足阳明胃经", location: "足背,第2、3趾间,趾蹼缘后方赤白肉际处", indications: "齿痛,咽喉肿痛,口歪,鼻衄,胃病吐酸,腹胀泄泻", method: "直刺或斜刺0.5-0.8寸", special: "荥穴", caution: "", mnemonic: "内庭清胃泻火", mnemonicExplanation: "内庭为胃经荥穴,善清胃火,治牙痛口臭", level: "二类", sortOrder: 47 },
  { id: "a_touwei", name: "头维", pinyin: "touwei", code: "ST8", meridian: "足阳明胃经", location: "头部,额角发际直上0.5寸,头正中线旁开4.5寸", indications: "头痛,目眩,目赤肿痛,迎风流泪,视物不明", method: "平刺0.5-1寸", special: "", caution: "", mnemonic: "头维清头明目", mnemonicExplanation: "头维善治头目疾患,为止头痛要穴", level: "二类", sortOrder: 48 },
  { id: "a_shaoshang", name: "少商", pinyin: "shaoshang", code: "LU11", meridian: "手太阴肺经", location: "拇指末节桡侧,指甲根角侧上方0.1寸", indications: "咽喉肿痛,咳嗽,鼻衄,发热,昏迷,癫狂", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "少商利咽开窍", mnemonicExplanation: "少商为肺经井穴,点刺出血善治咽痛昏迷", level: "二类", sortOrder: 49 },
  { id: "a_yinbai", name: "隐白", pinyin: "yinbai", code: "SP1", meridian: "足太阴脾经", location: "足大趾末节内侧,趾甲根角侧后方0.1寸", indications: "月经过多,崩漏,便血,尿血,癫狂,多梦,惊风", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "隐白统血止崩", mnemonicExplanation: "隐白为脾经井穴,善统血止崩漏", level: "二类", sortOrder: 50 },
  { id: "a_xiaochangshu", name: "小肠俞", pinyin: "xiaochangshu", code: "BL27", meridian: "足太阳膀胱经", location: "骶区,横平第1骶后孔,骶正中嵴旁开1.5寸", indications: "小腹胀痛,泄泻痢疾,遗精遗尿,腰骶痛,带下", method: "直刺0.8-1.2寸", special: "小肠背俞穴", caution: "", mnemonic: "小肠俞调肠腑", mnemonicExplanation: "小肠俞为小肠背俞穴,善调肠腑泌尿", level: "二类", sortOrder: 51 },
  { id: "a_shenshu", name: "肾俞", pinyin: "shenshu", code: "BL23", meridian: "足太阳膀胱经", location: "腰部,第2腰椎棘突下,旁开1.5寸", indications: "腰痛,遗精阳痿,遗尿,月经不调,耳鸣耳聋,水肿", method: "直刺0.8-1.2寸;可灸", special: "肾背俞穴", caution: "", mnemonic: "肾俞补肾固精", mnemonicExplanation: "肾俞为肾之背俞穴,善补肾壮腰固精", level: "一类", sortOrder: 52 },
  { id: "a_pishu", name: "脾俞", pinyin: "pishu", code: "BL20", meridian: "足太阳膀胱经", location: "背部,第11胸椎棘突下,旁开1.5寸", indications: "腹胀,呕吐,泄泻,痢疾,便血,水肿,背痛", method: "斜刺0.5-0.8寸;可灸", special: "脾背俞穴", caution: "不宜深刺,防伤内脏", mnemonic: "脾俞健脾化湿", mnemonicExplanation: "脾俞为脾之背俞穴,善健脾益气化湿", level: "二类", sortOrder: 53 },
  { id: "a_geshu", name: "膈俞", pinyin: "geshu", code: "BL17", meridian: "足太阳膀胱经", location: "背部,第7胸椎棘突下,旁开1.5寸", indications: "呕吐,呃逆,气喘,吐血,贫血,瘾疹,皮肤瘙痒", method: "斜刺0.5-0.8寸", special: "血会", caution: "不宜深刺", mnemonic: "膈俞血会活血", mnemonicExplanation: "膈俞为八会穴之血会,善治血证", level: "二类", sortOrder: 54 },
  { id: "a_xinshu", name: "心俞", pinyin: "xinshu", code: "BL15", meridian: "足太阳膀胱经", location: "背部,第5胸椎棘突下,旁开1.5寸", indications: "心痛,惊悸,失眠,健忘,癫痫,咳嗽吐血", method: "斜刺0.5-0.8寸", special: "心背俞穴", caution: "不宜深刺", mnemonic: "心俞宁心安神", mnemonicExplanation: "心俞为心之背俞穴,善宁心安神", level: "二类", sortOrder: 55 },
  { id: "a_dachangshu", name: "大肠俞", pinyin: "dachangshu", code: "BL25", meridian: "足太阳膀胱经", location: "腰部,第4腰椎棘突下,旁开1.5寸", indications: "腰腿痛,腹胀,泄泻,便秘,痢疾,痔疾", method: "直刺0.8-1.2寸", special: "大肠背俞穴", caution: "", mnemonic: "大肠俞调肠腰", mnemonicExplanation: "大肠俞为大肠背俞穴,善治肠腑与腰腿病", level: "二类", sortOrder: 56 },
  { id: "a_fuliu", name: "复溜", pinyin: "fuliu", code: "KI7", meridian: "足少阴肾经", location: "小腿内侧,太溪直上2寸,跟腱前缘", indications: "水肿,腹胀,泄泻,盗汗,汗出不止,腰脊强痛,下肢痿痹", method: "直刺0.5-1寸", special: "经穴", caution: "", mnemonic: "复溜利水止汗", mnemonicExplanation: "复溜善利水消肿,又能敛汗", level: "二类", sortOrder: 57 },
  { id: "a_dadu", name: "大都", pinyin: "dadu", code: "SP2", meridian: "足太阴脾经", location: "足趾,第1跖趾关节远端赤白肉际凹陷处", indications: "胃痛,腹胀,呕吐,泄泻,便秘,热病无汗", method: "直刺0.3-0.5寸", special: "荥穴", caution: "", mnemonic: "大都健脾和胃", mnemonicExplanation: "大都为脾经荥穴,善健脾和胃", level: "二类", sortOrder: 58 },
  { id: "a_guanyuanshu", name: "关元俞", pinyin: "guanyuanshu", code: "BL26", meridian: "足太阳膀胱经", location: "腰部,第5腰椎棘突下,旁开1.5寸", indications: "腰骶痛,腹胀泄泻,小便不利,遗尿,月经不调", method: "直刺0.8-1.2寸", special: "", caution: "", mnemonic: "关元俞补肾腰", mnemonicExplanation: "关元俞善治腰骶部疾患与泌尿生殖病", level: "二类", sortOrder: 59 },
  { id: "a_changqiang", name: "长强", pinyin: "changqiang", code: "GV1", meridian: "督脉", location: "尾骨下方,尾骨端与肛门连线的中点处", indications: "泄泻,痢疾,便秘,便血,痔疾,脱肛,癫狂痫,腰脊强痛", method: "斜刺,针尖向上与骶骨平行刺入0.5-1寸", special: "络穴", caution: "不宜直刺深刺", mnemonic: "长强通督治痔", mnemonicExplanation: "长强为督脉络穴,善治痔疾脱肛", level: "二类", sortOrder: 60 },
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
