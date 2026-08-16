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
  // ===== 腧穴扩充(2026-08,补齐十四经常用穴至 150+) =====
  { id: "a_kongzui", name: "孔最", pinyin: "kongzui", code: "LU6", meridian: "手太阴肺经", location: "前臂前区,腕掌侧远端横纹上7寸,太渊与尺泽连线上", indications: "咯血,咳嗽,气喘,咽喉肿痛,肘臂挛痛", method: "直刺0.5-1寸", special: "郄穴", caution: "", mnemonic: "孔最止血要穴", mnemonicExplanation: "孔最为肺经郄穴,善治咯血", level: "二类", sortOrder: 61 },
  { id: "a_yuji", name: "鱼际", pinyin: "yuji", code: "LU10", meridian: "手太阴肺经", location: "手外侧,第1掌骨桡侧中点赤白肉际处", indications: "咳嗽,咯血,咽喉肿痛,失音,发热", method: "直刺0.5-0.8寸", special: "荥穴", caution: "", mnemonic: "鱼际清肺利咽", mnemonicExplanation: "鱼际为肺经荥穴,善清肺热利咽喉", level: "二类", sortOrder: 62 },
  { id: "a_shangyang", name: "商阳", pinyin: "shangyang", code: "LI1", meridian: "手阳明大肠经", location: "食指末节桡侧,指甲根角侧上方0.1寸", indications: "咽喉肿痛,齿痛,耳聋,热病昏迷,手指麻木", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "商阳开窍利咽", mnemonicExplanation: "商阳为大肠经井穴,点刺出血治咽痛昏迷", level: "二类", sortOrder: 63 },
  { id: "a_sanjian", name: "三间", pinyin: "sanjian", code: "LI3", meridian: "手阳明大肠经", location: "手背,第2掌指关节桡侧近端凹陷处", indications: "齿痛,咽喉肿痛,目痛,腹胀,手指肿痛", method: "直刺0.3-0.5寸", special: "输穴", caution: "", mnemonic: "三间泻热止痛", mnemonicExplanation: "三间善泻阳明热邪,治齿痛咽肿", level: "二类", sortOrder: 64 },
  { id: "a_pianli", name: "偏历", pinyin: "pianli", code: "LI6", meridian: "手阳明大肠经", location: "前臂,腕背侧远端横纹上3寸,阳溪与曲池连线上", indications: "耳鸣,鼻衄,齿痛,目赤,水肿,手臂酸痛", method: "斜刺0.5-0.8寸", special: "络穴", caution: "", mnemonic: "偏历通络利水", mnemonicExplanation: "偏历为大肠经络穴,善治五官病与水肿", level: "二类", sortOrder: 65 },
  { id: "a_shousanli", name: "手三里", pinyin: "shousanli", code: "LI10", meridian: "手阳明大肠经", location: "前臂,肘横纹下2寸,阳溪与曲池连线上", indications: "肘臂疼痛,上肢麻木,腹痛腹泻,齿痛", method: "直刺0.8-1.2寸", special: "", caution: "", mnemonic: "手三里通络", mnemonicExplanation: "手三里善治肘臂不举与胃肠病", level: "二类", sortOrder: 66 },
  { id: "a_binao", name: "臂臑", pinyin: "binao", code: "LI14", meridian: "手阳明大肠经", location: "臂部,曲池上7寸,三角肌前缘处", indications: "肩臂疼痛,颈项拘挛,瘰疬,目疾", method: "直刺或斜刺0.8-1.5寸", special: "", caution: "", mnemonic: "臂臑通肩止痛", mnemonicExplanation: "臂臑善治肩臂疼痛与颈项拘急", level: "二类", sortOrder: 67 },
  { id: "a_yingxiang", name: "迎香", pinyin: "yingxiang", code: "LI20", meridian: "手阳明大肠经", location: "面部,鼻翼外缘中点旁,鼻唇沟中", indications: "鼻塞,鼻衄,鼻渊,口歪,面痒", method: "斜刺或平刺0.3-0.5寸", special: "", caution: "", mnemonic: "迎香通鼻要穴", mnemonicExplanation: "迎香善通鼻窍,为治鼻病要穴", level: "二类", sortOrder: 68 },
  { id: "a_jianyu", name: "肩髃", pinyin: "jianyu", code: "LI15", meridian: "手阳明大肠经", location: "肩峰前下方,当肩峰与肱骨大结节之间凹陷处", indications: "肩臂挛痛,上肢不遂,瘾疹,瘰疬", method: "直刺或向下斜刺0.8-1.5寸", special: "", caution: "", mnemonic: "肩髃肩痛要穴", mnemonicExplanation: "肩髃为治肩周炎(肩凝)要穴", level: "二类", sortOrder: 69 },
  { id: "a_yangxi", name: "阳溪", pinyin: "yangxi", code: "LI5", meridian: "手阳明大肠经", location: "腕背横纹桡侧,拇指向上翘起时,拇短伸肌腱与拇长伸肌腱之间的凹陷处", indications: "头痛,目赤肿痛,耳聋,齿痛,腕臂痛", method: "直刺0.5-0.8寸", special: "经穴", caution: "", mnemonic: "阳溪清头明目", mnemonicExplanation: "阳溪善清阳明郁热,治头面五官病", level: "二类", sortOrder: 70 },
  { id: "a_chengqi", name: "承泣", pinyin: "chengqi", code: "ST1", meridian: "足阳明胃经", location: "面部,瞳孔直下,眼球与眶下缘之间", indications: "目赤肿痛,流泪,夜盲,眼睑瞤动,口眼歪斜", method: "嘱患者闭目,医者以左手拇指向上轻推眼球,紧靠眶下缘缓慢直刺0.5-1寸", special: "", caution: "不宜提插,防刺伤眼球", mnemonic: "承泣明目要穴", mnemonicExplanation: "承泣为治眼病要穴", level: "二类", sortOrder: 71 },
  { id: "a_dicang", name: "地仓", pinyin: "dicang", code: "ST4", meridian: "足阳明胃经", location: "面部,口角旁开0.4寸", indications: "口歪,流涎,眼睑瞤动,齿痛颊肿", method: "斜刺或平刺0.5-0.8寸", special: "", caution: "", mnemonic: "地仓治口歪", mnemonicExplanation: "地仓善治口角歪斜流涎,为面瘫要穴", level: "二类", sortOrder: 72 },
  { id: "a_jiache", name: "颊车", pinyin: "jiache", code: "ST6", meridian: "足阳明胃经", location: "面部,下颌角前上方约一横指,咀嚼时咬肌隆起处", indications: "口歪,齿痛,颊肿,牙关紧闭,口噤不语", method: "直刺0.3-0.5寸;或平刺0.5-1寸", special: "", caution: "", mnemonic: "颊车开噤止痛", mnemonicExplanation: "颊车善治牙关紧闭与齿痛颊肿", level: "二类", sortOrder: 73 },
  { id: "a_xiaguan", name: "下关", pinyin: "xiaguan", code: "ST7", meridian: "足阳明胃经", location: "面部,颧弓下缘中央与下颌切迹之间的凹陷中", indications: "牙关不利,齿痛,面痛,口眼歪斜,耳鸣耳聋", method: "直刺0.5-1寸", special: "", caution: "", mnemonic: "下关通窍止痛", mnemonicExplanation: "下关善治颞下颌关节疾患与齿痛", level: "二类", sortOrder: 74 },
  { id: "a_liangmen", name: "梁门", pinyin: "liangmen", code: "ST21", meridian: "足阳明胃经", location: "上腹部,脐中上4寸,前正中线旁开2寸", indications: "胃痛,呕吐,食欲不振,腹胀,泄泻", method: "直刺0.8-1.2寸", special: "", caution: "", mnemonic: "梁门和胃消食", mnemonicExplanation: "梁门善治胃脘痛与食欲不振", level: "二类", sortOrder: 75 },
  { id: "a_dubi", name: "犊鼻", pinyin: "dubi", code: "ST35", meridian: "足阳明胃经", location: "膝前区,髌韧带外侧凹陷中", indications: "膝痛,屈伸不利,下肢麻痹,脚气", method: "向后内斜刺0.5-1寸", special: "", caution: "", mnemonic: "犊鼻治膝要穴", mnemonicExplanation: "犊鼻(外膝眼)为治膝痛要穴", level: "二类", sortOrder: 76 },
  { id: "a_fenglong", name: "丰隆", pinyin: "fenglong", code: "ST40", meridian: "足阳明胃经", location: "小腿外侧,外踝尖上8寸,胫骨前嵴外二横指", indications: "痰多咳嗽,头痛眩晕,癫狂痫,下肢痿痹,便秘", method: "直刺1-1.5寸", special: "络穴", caution: "", mnemonic: "丰隆化痰要穴", mnemonicExplanation: "丰隆为化痰要穴,善治一切痰证", level: "一类", sortOrder: 77 },
  { id: "a_liangqiu", name: "梁丘", pinyin: "liangqiu", code: "ST34", meridian: "足阳明胃经", location: "股前区,髌底上2寸,股外侧肌与股直肌肌腱之间", indications: "急性胃痛,膝肿痛,下肢不遂,乳痈", method: "直刺1-1.2寸", special: "郄穴", caution: "", mnemonic: "梁丘急痛要穴", mnemonicExplanation: "梁丘为胃经郄穴,善治急性胃痛", level: "二类", sortOrder: 78 },
  { id: "a_tiaokou", name: "条口", pinyin: "tiaokou", code: "ST38", meridian: "足阳明胃经", location: "小腿外侧,犊鼻下8寸,胫骨前嵴外一横指", indications: "肩臂痛,下肢痿痹,转筋,脘腹疼痛", method: "直刺1-1.5寸", special: "", caution: "", mnemonic: "条口治肩痛", mnemonicExplanation: "条口透承山,善治肩凝与下肢痹痛", level: "二类", sortOrder: 79 },
  { id: "a_jiexi", name: "解溪", pinyin: "jiexi", code: "ST41", meridian: "足阳明胃经", location: "踝区,踝关节前面中央凹陷中,拇长伸肌腱与趾长伸肌腱之间", indications: "头痛,眩晕,癫狂,腹胀便秘,踝关节痛", method: "直刺0.5-1寸", special: "经穴", caution: "", mnemonic: "解溪清胃通络", mnemonicExplanation: "解溪善清胃热,治踝部疾患", level: "二类", sortOrder: 80 },
  { id: "a_lidui", name: "厉兑", pinyin: "lidui", code: "ST45", meridian: "足阳明胃经", location: "足第2趾末节外侧,趾甲根角侧后方0.1寸", indications: "鼻衄,齿痛,咽喉肿痛,热病,多梦,癫狂", method: "浅刺0.1寸", special: "井穴", caution: "", mnemonic: "厉兑清胃醒神", mnemonicExplanation: "厉兑为胃经井穴,点刺出血清胃热", level: "二类", sortOrder: 81 },
  { id: "a_gongsun", name: "公孙", pinyin: "gongsun", code: "SP4", meridian: "足太阴脾经", location: "跖区,第1跖骨基底部的前下方赤白肉际处", indications: "胃痛,呕吐,腹痛泄泻,痢疾,心烦失眠", method: "直刺0.6-1.2寸", special: "络穴;八脉交会穴(通冲脉)", caution: "", mnemonic: "公孙和胃止呕", mnemonicExplanation: "公孙通冲脉,善治脾胃病与心痛", level: "二类", sortOrder: 82 },
  { id: "a_shangqiu", name: "商丘", pinyin: "shangqiu", code: "SP5", meridian: "足太阴脾经", location: "踝区,内踝前下方,舟骨粗隆与内踝尖连线中点凹陷处", indications: "腹胀,泄泻,便秘,黄疸,足踝痛", method: "直刺0.5-0.8寸", special: "经穴", caution: "", mnemonic: "商丘健脾利湿", mnemonicExplanation: "商丘善健脾化湿,治脾胃与踝部病", level: "二类", sortOrder: 83 },
  { id: "a_dabao", name: "大包", pinyin: "dabao", code: "SP21", meridian: "足太阴脾经", location: "胸外侧区,第6肋间隙,腋中线上", indications: "胸胁痛,气喘,全身疼痛,四肢无力", method: "斜刺或平刺0.5-0.8寸", special: "脾之大络", caution: "不可深刺,防伤肺脏", mnemonic: "大包通络宽胸", mnemonicExplanation: "大包为脾之大络,善治胸胁痛与全身疼痛", level: "二类", sortOrder: 84 },
  { id: "a_jiquan", name: "极泉", pinyin: "jiquan", code: "HT1", meridian: "手少阴心经", location: "腋窝中央,腋动脉搏动处", indications: "心痛,心悸,胁肋疼痛,上肢麻木不遂", method: "避开腋动脉,直刺0.5-1寸", special: "", caution: "避开腋动脉", mnemonic: "极泉宽胸宁心", mnemonicExplanation: "极泉善治心胸痹痛与上肢不遂", level: "二类", sortOrder: 85 },
  { id: "a_shaochong", name: "少冲", pinyin: "shaochong", code: "HT9", meridian: "手少阴心经", location: "小指末节桡侧,指甲根角侧上方0.1寸", indications: "心悸,心痛,癫狂,热病昏迷,胸胁痛", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "少冲开窍醒神", mnemonicExplanation: "少冲为心经井穴,急救开窍醒神", level: "二类", sortOrder: 86 },
  { id: "a_yinxi", name: "阴郄", pinyin: "yinxi", code: "HT6", meridian: "手少阴心经", location: "前臂前区,腕掌侧远端横纹上0.5寸,尺侧腕屈肌腱桡侧缘", indications: "心痛,惊悸,骨蒸盗汗,吐血衄血,暴喑", method: "直刺0.3-0.5寸", special: "郄穴", caution: "", mnemonic: "阴郄止汗要穴", mnemonicExplanation: "阴郄为心经郄穴,善治盗汗与心痛", level: "二类", sortOrder: 87 },
  { id: "a_shaoze", name: "少泽", pinyin: "shaoze", code: "SI1", meridian: "手太阳小肠经", location: "小指末节尺侧,指甲根角侧上方0.1寸", indications: "乳汁不足,乳痈,昏迷,热病,咽喉肿痛", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "少泽通乳要穴", mnemonicExplanation: "少泽为通乳要穴,点刺出血治乳少乳痈", level: "二类", sortOrder: 88 },
  { id: "a_yanglao", name: "养老", pinyin: "yanglao", code: "SI6", meridian: "手太阳小肠经", location: "前臂后区,腕背横纹上1寸,尺骨头桡侧凹陷中", indications: "目视不明,肩背肘臂酸痛,急性腰痛", method: "以掌心向胸,向肘方向斜刺0.5-0.8寸", special: "郄穴", caution: "", mnemonic: "养老明目止痛", mnemonicExplanation: "养老善治目视不明与肩背腰痛", level: "二类", sortOrder: 89 },
  { id: "a_tianzong", name: "天宗", pinyin: "tianzong", code: "SI11", meridian: "手太阳小肠经", location: "肩胛区,肩胛冈中点与肩胛骨下角连线上1/3与下2/3交点凹陷处", indications: "肩胛疼痛,肩背部损伤,气喘,乳痈", method: "直刺或斜刺0.5-1寸", special: "", caution: "", mnemonic: "天宗肩胛要穴", mnemonicExplanation: "天宗善治肩胛痛,为肩背要穴", level: "二类", sortOrder: 90 },
  { id: "a_xiaohai", name: "小海", pinyin: "xiaohai", code: "SI8", meridian: "手太阳小肠经", location: "肘后区,尺骨鹰嘴与肱骨内上髁之间凹陷处", indications: "肘臂疼痛,麻木,癫痫,耳聋耳鸣", method: "直刺0.3-0.5寸", special: "合穴", caution: "", mnemonic: "小海通络定痫", mnemonicExplanation: "小海为小肠经合穴,治肘臂病与癫痫", level: "二类", sortOrder: 91 },
  { id: "a_quanliao", name: "颧髎", pinyin: "quanliao", code: "SI18", meridian: "手太阳小肠经", location: "面部,目外眦直下,颧骨下缘凹陷处", indications: "口眼歪斜,眼睑瞤动,齿痛,面痛,颊肿", method: "直刺0.3-0.5寸", special: "", caution: "", mnemonic: "颧髎治面瘫", mnemonicExplanation: "颧髎善治面瘫与三叉神经痛", level: "二类", sortOrder: 92 },
  { id: "a_cuanzhu", name: "攒竹", pinyin: "cuanzhu", code: "BL2", meridian: "足太阳膀胱经", location: "面部,眉头凹陷中,额切迹处", indications: "头痛,眉棱骨痛,目赤肿痛,眼睑瞤动,鼻塞", method: "平刺0.5-0.8寸", special: "", caution: "禁灸", mnemonic: "攒竹明目止痛", mnemonicExplanation: "攒竹善治头痛目疾与眼睑瞤动", level: "二类", sortOrder: 93 },
  { id: "a_tianzhu", name: "天柱", pinyin: "tianzhu", code: "BL10", meridian: "足太阳膀胱经", location: "颈后区,横平第2颈椎棘突上际,斜方肌外缘凹陷中", indications: "头痛,项强,眩晕,目赤肿痛,肩背痛", method: "直刺或斜刺0.5-0.8寸", special: "", caution: "不可向内上方深刺,防伤延髓", mnemonic: "天柱清头明目", mnemonicExplanation: "天柱善治头项强痛与目疾", level: "二类", sortOrder: 94 },
  { id: "a_fengmen", name: "风门", pinyin: "fengmen", code: "BL12", meridian: "足太阳膀胱经", location: "背部,第2胸椎棘突下,旁开1.5寸", indications: "感冒,咳嗽,发热头痛,项强,胸背痛", method: "斜刺0.5-0.8寸;可灸", special: "", caution: "不宜深刺", mnemonic: "风门祛风解表", mnemonicExplanation: "风门为祛风要穴,善治外感风寒", level: "二类", sortOrder: 95 },
  { id: "a_feishu", name: "肺俞", pinyin: "feishu", code: "BL13", meridian: "足太阳膀胱经", location: "背部,第3胸椎棘突下,旁开1.5寸", indications: "咳嗽,气喘,咯血,鼻塞,骨蒸潮热,盗汗", method: "斜刺0.5-0.8寸;可灸", special: "肺背俞穴", caution: "不宜深刺", mnemonic: "肺俞止咳平喘", mnemonicExplanation: "肺俞为肺之背俞穴,善治肺系诸疾", level: "一类", sortOrder: 96 },
  { id: "a_ganshu", name: "肝俞", pinyin: "ganshu", code: "BL18", meridian: "足太阳膀胱经", location: "背部,第9胸椎棘突下,旁开1.5寸", indications: "胁痛,黄疸,目赤,视物不明,眩晕,癫狂痫", method: "斜刺0.5-0.8寸", special: "肝背俞穴", caution: "不宜深刺", mnemonic: "肝俞疏肝明目", mnemonicExplanation: "肝俞为肝之背俞穴,善治肝胆与目疾", level: "二类", sortOrder: 97 },
  { id: "a_danshu", name: "胆俞", pinyin: "danshu", code: "BL19", meridian: "足太阳膀胱经", location: "背部,第10胸椎棘突下,旁开1.5寸", indications: "黄疸,口苦,胁痛,肺痨潮热,呕吐", method: "斜刺0.5-0.8寸", special: "胆背俞穴", caution: "不宜深刺", mnemonic: "胆俞利胆退黄", mnemonicExplanation: "胆俞为胆之背俞穴,善治胆病黄疸", level: "二类", sortOrder: 98 },
  { id: "a_weishu", name: "胃俞", pinyin: "weishu", code: "BL21", meridian: "足太阳膀胱经", location: "背部,第12胸椎棘突下,旁开1.5寸", indications: "胃脘痛,呕吐,腹胀肠鸣,胸胁痛,消化不良", method: "斜刺0.5-0.8寸;可灸", special: "胃背俞穴", caution: "不宜深刺", mnemonic: "胃俞和胃止痛", mnemonicExplanation: "胃俞为胃之背俞穴,善治胃脘诸疾", level: "二类", sortOrder: 99 },
  { id: "a_sanjiaoshu", name: "三焦俞", pinyin: "sanjiaoshu", code: "BL22", meridian: "足太阳膀胱经", location: "腰部,第1腰椎棘突下,旁开1.5寸", indications: "肠鸣腹胀,呕吐泄泻,水肿,腰背强痛", method: "直刺0.8-1.2寸", special: "三焦背俞穴", caution: "", mnemonic: "三焦俞利水道", mnemonicExplanation: "三焦俞为三焦背俞穴,善调水道", level: "二类", sortOrder: 100 },
  { id: "a_pangguangshu", name: "膀胱俞", pinyin: "pangguangshu", code: "BL28", meridian: "足太阳膀胱经", location: "骶区,横平第2骶后孔,骶正中嵴旁开1.5寸", indications: "小便不利,遗尿,泄泻,便秘,腰骶疼痛", method: "直刺0.8-1.2寸", special: "膀胱背俞穴", caution: "", mnemonic: "膀胱俞调水道", mnemonicExplanation: "膀胱俞为膀胱背俞穴,善治小便不利", level: "二类", sortOrder: 101 },
  { id: "a_zhubian", name: "秩边", pinyin: "zhubian", code: "BL54", meridian: "足太阳膀胱经", location: "骶区,横平第4骶后孔,骶正中嵴旁开3寸", indications: "腰骶痛,下肢痿痹,小便不利,痔疾,便秘", method: "直刺1.5-2寸", special: "", caution: "", mnemonic: "秩边通络止痛", mnemonicExplanation: "秩边善治腰骶与下肢疾患", level: "二类", sortOrder: 102 },
  { id: "a_chengfu", name: "承扶", pinyin: "chengfu", code: "BL36", meridian: "足太阳膀胱经", location: "臀部,臀沟中点处", indications: "腰骶臀股疼痛,痔疾,下肢痿痹", method: "直刺1-2寸", special: "", caution: "", mnemonic: "承扶通络治痔", mnemonicExplanation: "承扶善治腰臀腿痛与痔疾", level: "二类", sortOrder: 103 },
  { id: "a_dazhu", name: "大杼", pinyin: "dazhu", code: "BL11", meridian: "足太阳膀胱经", location: "背部,第1胸椎棘突下,旁开1.5寸", indications: "咳嗽,发热,项强,肩背痛,骨病", method: "斜刺0.5-0.8寸", special: "八会穴之骨会", caution: "不宜深刺", mnemonic: "大杼骨会强骨", mnemonicExplanation: "大杼为八会穴之骨会,善治骨病", level: "二类", sortOrder: 104 },
  { id: "a_gaohuang", name: "膏肓", pinyin: "gaohuang", code: "BL43", meridian: "足太阳膀胱经", location: "背部,第4胸椎棘突下,旁开3寸", indications: "肺痨,咳嗽气喘,盗汗,健忘,遗精,虚劳羸瘦", method: "斜刺0.5-0.8寸;多用灸法", special: "", caution: "不宜深刺", mnemonic: "膏肓补虚要穴", mnemonicExplanation: "膏肓善治虚劳羸瘦,为强壮要穴", level: "二类", sortOrder: 105 },
  { id: "a_feiyang", name: "飞扬", pinyin: "feiyang", code: "BL58", meridian: "足太阳膀胱经", location: "小腿后区,昆仑直上7寸,腓肠肌外下缘与跟腱移行处", indications: "头痛,目眩,鼻塞,腰腿痛,痔疾", method: "直刺1-1.5寸", special: "络穴", caution: "", mnemonic: "飞扬通络止痛", mnemonicExplanation: "飞扬为膀胱经络穴,善治腰腿痛", level: "二类", sortOrder: 106 },
  { id: "a_jinggu", name: "京骨", pinyin: "jinggu", code: "BL64", meridian: "足太阳膀胱经", location: "跖区,第5跖骨粗隆前下方,赤白肉际处", indications: "头痛,项强,腰腿痛,癫痫,目翳", method: "直刺0.3-0.5寸", special: "原穴", caution: "", mnemonic: "京骨通络止痛", mnemonicExplanation: "京骨为膀胱经原穴,善治头项腰腿痛", level: "二类", sortOrder: 107 },
  { id: "a_zhiyin", name: "至阴", pinyin: "zhiyin", code: "BL67", meridian: "足太阳膀胱经", location: "足小趾末节外侧,趾甲根角侧后方0.1寸", indications: "胎位不正,难产,头痛,目痛,鼻塞,鼻衄", method: "浅刺0.1寸;灸法用于矫正胎位", special: "井穴", caution: "孕妇禁针(灸可矫正胎位)", mnemonic: "至阴矫正胎位", mnemonicExplanation: "至阴为矫正胎位要穴(艾灸)", level: "二类", sortOrder: 108 },
  { id: "a_rangu", name: "然谷", pinyin: "rangu", code: "KI2", meridian: "足少阴肾经", location: "足内侧,舟骨粗隆下方,赤白肉际处", indications: "月经不调,遗精,阳痿,消渴,咽喉肿痛,足跗痛", method: "直刺0.5-0.8寸", special: "荥穴", caution: "", mnemonic: "然谷滋肾清热", mnemonicExplanation: "然谷为肾经荥穴,善滋阴清热", level: "二类", sortOrder: 109 },
  { id: "a_dazhong", name: "大钟", pinyin: "dazhong", code: "KI4", meridian: "足少阴肾经", location: "跟区,内踝后下方,跟腱附着部内侧前方凹陷处", indications: "癃闭,遗尿,便秘,痴呆,足跟痛,气喘", method: "直刺0.3-0.5寸", special: "络穴", caution: "", mnemonic: "大钟通络益肾", mnemonicExplanation: "大钟为肾经络穴,善治肾虚诸证", level: "二类", sortOrder: 110 },
  { id: "a_yingu", name: "阴谷", pinyin: "yingu", code: "KI10", meridian: "足少阴肾经", location: "膝后区,腘横纹上,半腱肌腱外侧缘", indications: "阳痿,疝痛,崩漏,小便不利,膝股内侧痛", method: "直刺1-1.5寸", special: "合穴", caution: "", mnemonic: "阴谷补肾利水", mnemonicExplanation: "阴谷为肾经合穴,善治肾虚与小便不利", level: "二类", sortOrder: 111 },
  { id: "a_zhubin", name: "筑宾", pinyin: "zhubin", code: "KI9", meridian: "足少阴肾经", location: "小腿内侧,太溪直上5寸,比目鱼肌与跟腱之间", indications: "癫狂痫,呕吐涎沫,疝痛,小腿内侧痛", method: "直刺1-1.5寸", special: "阴维脉郄穴", caution: "", mnemonic: "筑宾定痫止呕", mnemonicExplanation: "筑宾为阴维脉郄穴,善治癫狂与呕吐", level: "二类", sortOrder: 112 },
  { id: "a_yufu", name: "俞府", pinyin: "yufu", code: "KI27", meridian: "足少阴肾经", location: "胸部,锁骨下缘,前正中线旁开2寸", indications: "咳嗽,气喘,胸痛,呕吐,不嗜食", method: "斜刺或平刺0.5-0.8寸", special: "", caution: "不可深刺,防伤肺脏", mnemonic: "俞府止咳平喘", mnemonicExplanation: "俞府善治咳喘胸痛", level: "二类", sortOrder: 113 },
  { id: "a_quze", name: "曲泽", pinyin: "quze", code: "PC3", meridian: "手厥阴心包经", location: "肘前区,肘横纹上,肱二头肌腱尺侧缘凹陷中", indications: "心痛,心悸,胃痛,呕吐,热病,肘臂挛痛", method: "直刺0.8-1寸;或点刺出血", special: "合穴", caution: "", mnemonic: "曲泽清心止呕", mnemonicExplanation: "曲泽为心包经合穴,善清心火止呕", level: "二类", sortOrder: 114 },
  { id: "a_laogong", name: "劳宫", pinyin: "laogong", code: "PC8", meridian: "手厥阴心包经", location: "掌区,横平第3掌指关节近端,第2、3掌骨之间偏于第3掌骨", indications: "心痛,心烦,癫狂痫,口疮口臭,鹅掌风", method: "直刺0.3-0.5寸", special: "荥穴", caution: "", mnemonic: "劳宫清心开窍", mnemonicExplanation: "劳宫为心包经荥穴,善清心火,治口疮", level: "二类", sortOrder: 115 },
  { id: "a_zhongchong", name: "中冲", pinyin: "zhongchong", code: "PC9", meridian: "手厥阴心包经", location: "中指末端,指甲根角侧上方0.1寸", indications: "昏迷,中暑,心痛,舌强肿痛,小儿惊风", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "中冲急救开窍", mnemonicExplanation: "中冲为急救要穴,点刺出血醒神开窍", level: "二类", sortOrder: 116 },
  { id: "a_ximen", name: "郄门", pinyin: "ximen", code: "PC4", meridian: "手厥阴心包经", location: "前臂前区,腕掌侧远端横纹上5寸,掌长肌腱与桡侧腕屈肌腱之间", indications: "心痛,心悸,胸痛,咳血,呕血,疔疮", method: "直刺0.5-1寸", special: "郄穴", caution: "", mnemonic: "郄门急痛止血", mnemonicExplanation: "郄门为心包经郄穴,善治心胸急痛与血证", level: "二类", sortOrder: 117 },
  { id: "a_guanchong", name: "关冲", pinyin: "guanchong", code: "TE1", meridian: "手少阳三焦经", location: "无名指末节尺侧,指甲根角侧上方0.1寸", indications: "头痛,目赤,耳聋,咽喉肿痛,热病,昏厥", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "关冲清热开窍", mnemonicExplanation: "关冲为三焦经井穴,点刺出血清热开窍", level: "二类", sortOrder: 118 },
  { id: "a_yangchi", name: "阳池", pinyin: "yangchi", code: "TE4", meridian: "手少阳三焦经", location: "腕后区,腕背侧远端横纹上,指伸肌腱的尺侧缘凹陷中", indications: "耳聋,口干,咽喉肿痛,腕痛,消渴", method: "直刺0.3-0.5寸", special: "原穴", caution: "", mnemonic: "阳池通络利腕", mnemonicExplanation: "阳池为三焦经原穴,善治腕痛消渴", level: "二类", sortOrder: 119 },
  { id: "a_zhigou", name: "支沟", pinyin: "zhigou", code: "TE6", meridian: "手少阳三焦经", location: "前臂后区,腕背侧远端横纹上3寸,尺骨与桡骨间隙中点", indications: "便秘,胁肋痛,耳鸣耳聋,暴喑,热病", method: "直刺0.5-1寸", special: "经穴", caution: "", mnemonic: "支沟通便要穴", mnemonicExplanation: "支沟为治便秘要穴,兼理胁痛", level: "二类", sortOrder: 120 },
  { id: "a_yifeng", name: "翳风", pinyin: "yifeng", code: "TE17", meridian: "手少阳三焦经", location: "颈部,耳垂后方,乳突下端前方凹陷中", indications: "耳鸣耳聋,口眼歪斜,牙关紧闭,颊肿,瘰疬", method: "直刺0.5-1寸", special: "", caution: "", mnemonic: "翳风聪耳通络", mnemonicExplanation: "翳风善治耳病与面瘫,为治耳鸣要穴", level: "二类", sortOrder: 121 },
  { id: "a_tianjing", name: "天井", pinyin: "tianjing", code: "TE10", meridian: "手少阳三焦经", location: "肘后区,肘尖直上1寸凹陷中", indications: "偏头痛,耳聋,瘰疬,肘臂痛,癫痫", method: "直刺0.5-1寸", special: "合穴", caution: "", mnemonic: "天井散结通络", mnemonicExplanation: "天井为三焦经合穴,善治瘰疬与肘臂痛", level: "二类", sortOrder: 122 },
  { id: "a_sizhukong", name: "丝竹空", pinyin: "sizhukong", code: "TE23", meridian: "手少阳三焦经", location: "面部,眉梢凹陷处", indications: "头痛,目赤肿痛,眼睑瞤动,齿痛,癫痫", method: "平刺0.3-0.5寸", special: "", caution: "禁灸", mnemonic: "丝竹空清头目", mnemonicExplanation: "丝竹空善治头目疾患,平刺不宜灸", level: "二类", sortOrder: 123 },
  { id: "a_tinghui", name: "听会", pinyin: "tinghui", code: "GB2", meridian: "足少阳胆经", location: "面部,耳屏间切迹与下颌骨髁突之间的凹陷中", indications: "耳鸣,耳聋,聤耳,齿痛,口眼歪斜", method: "张口,直刺0.5-0.8寸", special: "", caution: "", mnemonic: "听会聪耳要穴", mnemonicExplanation: "听会为治耳病要穴,善聪耳", level: "二类", sortOrder: 124 },
  { id: "a_tongziliao", name: "瞳子髎", pinyin: "tongziliao", code: "GB1", meridian: "足少阳胆经", location: "面部,目外眦外侧0.5寸凹陷中", indications: "目赤肿痛,目翳,头痛,口眼歪斜", method: "平刺0.3-0.5寸", special: "", caution: "", mnemonic: "瞳子髎明目", mnemonicExplanation: "瞳子髎善治目疾与面瘫", level: "二类", sortOrder: 125 },
  { id: "a_shuaigu", name: "率谷", pinyin: "shuaigu", code: "GB8", meridian: "足少阳胆经", location: "头部,耳尖直上入发际1.5寸", indications: "偏头痛,眩晕,小儿急慢惊风", method: "平刺0.5-0.8寸", special: "", caution: "", mnemonic: "率谷止偏头痛", mnemonicExplanation: "率谷善治偏头痛,为少阳头痛要穴", level: "二类", sortOrder: 126 },
  { id: "a_yangbai", name: "阳白", pinyin: "yangbai", code: "GB14", meridian: "足少阳胆经", location: "头部,眉上1寸,瞳孔直上", indications: "头痛,目眩,目痛,视物模糊,眼睑瞤动", method: "平刺0.3-0.5寸", special: "", caution: "", mnemonic: "阳白清头明目", mnemonicExplanation: "阳白善治前额头痛与目疾", level: "二类", sortOrder: 127 },
  { id: "a_toulinqi", name: "头临泣", pinyin: "toulinqi", code: "GB15", meridian: "足少阳胆经", location: "头部,前发际上0.5寸,瞳孔直上", indications: "头痛,目眩,目赤肿痛,流泪,鼻塞,癫痫", method: "平刺0.5-0.8寸", special: "", caution: "", mnemonic: "临泣清头明目", mnemonicExplanation: "头临泣善治头目诸疾", level: "二类", sortOrder: 128 },
  { id: "a_fengshi", name: "风市", pinyin: "fengshi", code: "GB31", meridian: "足少阳胆经", location: "大腿外侧,腘横纹上7寸,直立垂手时中指尖处", indications: "下肢痿痹,麻木,半身不遂,遍身瘙痒", method: "直刺1-2寸", special: "", caution: "", mnemonic: "风市祛风通络", mnemonicExplanation: "风市善治下肢痿痹,兼祛风止痒", level: "二类", sortOrder: 129 },
  { id: "a_guangming", name: "光明", pinyin: "guangming", code: "GB37", meridian: "足少阳胆经", location: "小腿外侧,外踝尖上5寸,腓骨前缘", indications: "目痛,夜盲,近视,乳胀痛,下肢痿痹", method: "直刺0.5-0.8寸", special: "络穴", caution: "", mnemonic: "光明明目要穴", mnemonicExplanation: "光明为胆经络穴,善明目,为治眼病要穴", level: "二类", sortOrder: 130 },
  { id: "a_muchuang", name: "目窗", pinyin: "muchuang", code: "GB16", meridian: "足少阳胆经", location: "头部,前发际上1.5寸,瞳孔直上", indications: "头痛,目赤肿痛,青盲,鼻塞,癫痫", method: "平刺0.5-0.8寸", special: "", caution: "", mnemonic: "目窗明目开窍", mnemonicExplanation: "目窗善治目疾与头痛", level: "二类", sortOrder: 131 },
  { id: "a_qiuxu", name: "丘墟", pinyin: "qiuxu", code: "GB40", meridian: "足少阳胆经", location: "踝区,外踝的前下方,趾长伸肌腱的外侧凹陷中", indications: "胸胁痛,颈项痛,踝关节痛,目赤肿痛,疟疾", method: "直刺0.5-0.8寸", special: "原穴", caution: "", mnemonic: "丘墟疏肝通络", mnemonicExplanation: "丘墟为胆经原穴,善治胁痛踝痛", level: "二类", sortOrder: 132 },
  { id: "a_zuqiaoyin", name: "足窍阴", pinyin: "zuqiaoyin", code: "GB44", meridian: "足少阳胆经", location: "足第4趾末节外侧,趾甲根角侧后方0.1寸", indications: "头痛,目赤肿痛,耳聋,咽喉肿痛,失眠,胁痛", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "窍阴清热开窍", mnemonicExplanation: "足窍阴为胆经井穴,善清肝胆热", level: "二类", sortOrder: 133 },
  { id: "a_dadun", name: "大敦", pinyin: "dadun", code: "LR1", meridian: "足厥阴肝经", location: "足大趾末节外侧,趾甲根角侧后方0.1寸", indications: "疝气,遗尿,癃闭,月经不调,崩漏,癫痫", method: "浅刺0.1寸;或点刺出血", special: "井穴", caution: "", mnemonic: "大敦疏肝治疝", mnemonicExplanation: "大敦为肝经井穴,善治疝气与崩漏", level: "二类", sortOrder: 134 },
  { id: "a_xingjian", name: "行间", pinyin: "xingjian", code: "LR2", meridian: "足厥阴肝经", location: "足背,第1、2趾间,趾蹼缘后方赤白肉际处", indications: "头痛,目赤肿痛,胁痛,月经不调,痛经,癫痫", method: "直刺0.5-0.8寸", special: "荥穴", caution: "", mnemonic: "行间清肝泻火", mnemonicExplanation: "行间为肝经荥穴,善清肝泻火", level: "二类", sortOrder: 135 },
  { id: "a_ligou", name: "蠡沟", pinyin: "ligou", code: "LR5", meridian: "足厥阴肝经", location: "小腿内侧,内踝尖上5寸,胫骨内侧面的中央", indications: "阴痒,带下,月经不调,小便不利,疝气,足胫痛", method: "平刺0.5-0.8寸", special: "络穴", caution: "", mnemonic: "蠡沟调经止痒", mnemonicExplanation: "蠡沟为肝经络穴,善治阴痒带下", level: "二类", sortOrder: 136 },
  { id: "a_zhongdu", name: "中都", pinyin: "zhongdu", code: "LR6", meridian: "足厥阴肝经", location: "小腿内侧,内踝尖上7寸,胫骨内侧面的中央", indications: "疝气,崩漏,小腹痛,胁痛,下肢痿痹", method: "平刺0.5-0.8寸", special: "郄穴", caution: "", mnemonic: "中都郄穴止痛", mnemonicExplanation: "中都为肝经郄穴,善治崩漏急痛", level: "二类", sortOrder: 137 },
  { id: "a_ququan", name: "曲泉", pinyin: "ququan", code: "LR8", meridian: "足厥阴肝经", location: "膝部,腘横纹内侧端,半腱肌肌腱内缘凹陷中", indications: "月经不调,痛经,遗精,阳痿,膝股内侧痛", method: "直刺1-1.5寸", special: "合穴", caution: "", mnemonic: "曲泉补肝调经", mnemonicExplanation: "曲泉为肝经合穴,善治妇科与膝痛", level: "二类", sortOrder: 138 },
  { id: "a_shenting", name: "神庭", pinyin: "shenting", code: "GV24", meridian: "督脉", location: "头部,前发际正中直上0.5寸", indications: "头痛,眩晕,失眠,鼻渊,癫痫", method: "平刺0.3-0.5寸", special: "", caution: "", mnemonic: "神庭安神定志", mnemonicExplanation: "神庭善治头痛失眠与癫痫", level: "二类", sortOrder: 139 },
  { id: "a_shenzhu", name: "身柱", pinyin: "shenzhu", code: "GV12", meridian: "督脉", location: "背部,第3胸椎棘突下凹陷中", indications: "咳嗽,气喘,癫痫,脊背强痛,小儿惊风", method: "向上斜刺0.5-1寸", special: "", caution: "", mnemonic: "身柱止咳定惊", mnemonicExplanation: "身柱善治咳喘与小儿惊风", level: "二类", sortOrder: 140 },
  { id: "a_zhiyang", name: "至阳", pinyin: "zhiyang", code: "GV9", meridian: "督脉", location: "背部,第7胸椎棘突下凹陷中", indications: "胸胁胀痛,黄疸,咳嗽气喘,脊背强痛", method: "向上斜刺0.5-1寸", special: "", caution: "", mnemonic: "至阳退黄止痛", mnemonicExplanation: "至阳善治胸胁痛与黄疸", level: "二类", sortOrder: 141 },
  { id: "a_yaoyangguan", name: "腰阳关", pinyin: "yaoyangguan", code: "GV3", meridian: "督脉", location: "腰部,第4腰椎棘突下凹陷中", indications: "腰骶疼痛,下肢痿痹,月经不调,遗精阳痿", method: "直刺0.5-1寸", special: "", caution: "", mnemonic: "腰阳关壮腰", mnemonicExplanation: "腰阳关善治腰骶痛与下肢痿痹", level: "二类", sortOrder: 142 },
  { id: "a_fengfu", name: "风府", pinyin: "fengfu", code: "GV16", meridian: "督脉", location: "颈后区,枕外隆凸直下,两侧斜方肌之间凹陷中", indications: "头痛,项强,眩晕,咽喉肿痛,中风不语,癫狂", method: "正坐位,头微前倾,向下颌方向缓慢刺入0.5-1寸", special: "", caution: "不可向上深刺,防伤延髓", mnemonic: "风府祛风开窍", mnemonicExplanation: "风府善祛风邪,治头项强痛", level: "二类", sortOrder: 143 },
  { id: "a_yanmen", name: "哑门", pinyin: "yanmen", code: "GV15", meridian: "督脉", location: "颈后区,第2颈椎棘突上际凹陷中", indications: "暴喑,舌强不语,头痛项强,癫痫", method: "正坐位,头微前倾,向下颌方向缓慢刺入0.5-1寸", special: "", caution: "不可向上深刺,防伤延髓", mnemonic: "哑门开音要穴", mnemonicExplanation: "哑门善治暴喑失语,为开音要穴", level: "二类", sortOrder: 144 },
  { id: "a_shendao", name: "神道", pinyin: "shendao", code: "GV11", meridian: "督脉", location: "背部,第5胸椎棘突下凹陷中", indications: "心痛,心悸,失眠,健忘,咳嗽,脊背强痛", method: "向上斜刺0.5-1寸", special: "", caution: "", mnemonic: "神道宁心安神", mnemonicExplanation: "神道善治心悸失眠", level: "二类", sortOrder: 145 },
  { id: "a_qugu", name: "曲骨", pinyin: "qugu", code: "CV2", meridian: "任脉", location: "下腹部,前正中线上,耻骨联合上缘的中点处", indications: "小便不利,遗尿,遗精阳痿,月经不调,带下", method: "直刺0.5-1寸", special: "任脉与足厥阴经交会穴", caution: "排尿后进行针刺", mnemonic: "曲骨利水调经", mnemonicExplanation: "曲骨善治泌尿生殖系疾患", level: "二类", sortOrder: 146 },
  { id: "a_shenque", name: "神阙", pinyin: "shenque", code: "CV8", meridian: "任脉", location: "腹部,脐中央", indications: "腹痛,泄泻,脱肛,水肿,虚脱,中风脱证", method: "一般不针,多用艾炷隔盐灸", special: "", caution: "禁针,多用灸法", mnemonic: "神阙回阳救逆", mnemonicExplanation: "神阙多用隔盐灸,善回阳固脱", level: "二类", sortOrder: 147 },
  { id: "a_yinjiao", name: "阴交", pinyin: "yinjiao", code: "CV7", meridian: "任脉", location: "下腹部,前正中线上,脐中下1寸", indications: "腹痛,水肿,月经不调,带下,疝气,脐周痛", method: "直刺1-1.5寸", special: "任脉与冲脉交会穴", caution: "孕妇慎用", mnemonic: "阴交调经利水", mnemonicExplanation: "阴交善治妇科与水肿诸证", level: "二类", sortOrder: 148 },
  { id: "a_shimen", name: "石门", pinyin: "shimen", code: "CV5", meridian: "任脉", location: "下腹部,前正中线上,脐中下2寸", indications: "腹痛,水肿,小便不利,泄泻,经闭,带下", method: "直刺1-1.5寸", special: "三焦募穴", caution: "孕妇禁针", mnemonic: "石门利水通经", mnemonicExplanation: "石门为三焦募穴,善治水肿与经闭", level: "二类", sortOrder: 149 },
  { id: "a_zhongji", name: "中极", pinyin: "zhongji", code: "CV3", meridian: "任脉", location: "下腹部,前正中线上,脐中下4寸", indications: "癃闭,遗尿,尿频,月经不调,痛经,带下,遗精", method: "直刺1-1.5寸;排尿后针刺", special: "膀胱募穴;任脉与足三阴经交会穴", caution: "排尿后进行针刺", mnemonic: "中极通利膀胱", mnemonicExplanation: "中极为膀胱募穴,善治小便不利与妇科病", level: "一类", sortOrder: 150 },
  { id: "a_shangwan", name: "上脘", pinyin: "shangwan", code: "CV13", meridian: "任脉", location: "上腹部,前正中线上,脐中上5寸", indications: "胃痛,呕吐,呃逆,腹胀,癫痫", method: "直刺1-1.5寸", special: "任脉与足阳明经交会穴", caution: "", mnemonic: "上脘和胃降逆", mnemonicExplanation: "上脘善治胃痛呕吐与癫痫", level: "二类", sortOrder: 151 },
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
