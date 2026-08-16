// 中药种子数据入库脚本(Phase 1)
// 用法: DATABASE_URL=... DIRECT_URL=... npx tsx scripts/seed-herbs-db.ts
// 幂等:已存在的分类/中药自动跳过;重复执行安全
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// 分类表:名称 → sortOrder(按教材章节)
const CATEGORIES: { name: string; sortOrder: number }[] = [
  { name: "解表药", sortOrder: 1 },
  { name: "清热药", sortOrder: 2 },
  { name: "泻下药", sortOrder: 3 },
  { name: "祛风湿药", sortOrder: 4 },
  { name: "化湿药", sortOrder: 5 },
  { name: "利水渗湿药", sortOrder: 6 },
  { name: "温里药", sortOrder: 7 },
  { name: "理气药", sortOrder: 8 },
  { name: "消食药", sortOrder: 9 },
  { name: "驱虫药", sortOrder: 10 },
  { name: "止血药", sortOrder: 11 },
  { name: "活血化瘀药", sortOrder: 12 },
  { name: "化痰止咳平喘药", sortOrder: 13 },
  { name: "安神药", sortOrder: 14 },
  { name: "平肝息风药", sortOrder: 15 },
  { name: "开窍药", sortOrder: 16 },
  { name: "补虚药", sortOrder: 17 },
  { name: "收涩药", sortOrder: 18 },
];

// 种子 26 味(公开标准整理,来源标注)
const SEED_HERBS: {
  id: string;
  name: string;
  category: string;
  property: string;
  meridian: string;
  functions: string;
  indications: string;
  level: string;
  mnemonic?: string;
  mnemonicExplanation?: string;
}[] = [
  { id: "h_mahuang", name: "麻黄", category: "解表药", property: "辛、微苦,温", meridian: "肺、膀胱", functions: "发汗解表,宣肺平喘,利水消肿", indications: "风寒感冒,咳嗽气喘,风水水肿", level: "一类", mnemonic: "麻黄辛温,发汗解表,宣肺平喘", mnemonicExplanation: "麻黄发汗力强,为发汗解表第一要药" },
  { id: "h_guizhi", name: "桂枝", category: "解表药", property: "辛、甘,温", meridian: "心、肺、膀胱", functions: "发汗解肌,温通经脉,助阳化气", indications: "风寒感冒,寒凝血滞诸痛,痰饮水肿", level: "一类", mnemonic: "桂枝辛温,解肌通脉", mnemonicExplanation: "桂枝善温通经脉,和营解肌" },
  { id: "h_baishao", name: "白芍", category: "补虚药", property: "苦、酸,微寒", meridian: "肝、脾", functions: "养血敛阴,柔肝止痛,平抑肝阳", indications: "血虚萎黄,肝阳上亢,腹痛拘挛", level: "一类", mnemonic: "白芍养血柔肝", mnemonicExplanation: "白芍养血敛阴,与桂枝配伍调和营卫" },
  { id: "h_shigao", name: "石膏", category: "清热药", property: "甘、辛,大寒", meridian: "肺、胃", functions: "生用清热泻火,除烦止渴;煅用收湿敛疮", indications: "气分实热证,肺热喘咳,胃火牙痛", level: "一类", mnemonic: "石膏大寒清气热", mnemonicExplanation: "石膏为清泻肺胃气分实热之要药" },
  { id: "h_zhimu", name: "知母", category: "清热药", property: "苦、甘,寒", meridian: "肺、胃、肾", functions: "清热泻火,滋阴润燥", indications: "热病烦渴,肺热燥咳,骨蒸潮热", level: "一类", mnemonic: "知母清润三经", mnemonicExplanation: "知母既清肺胃实热,又滋肾阴" },
  { id: "h_huangqin", name: "黄芩", category: "清热药", property: "苦,寒", meridian: "肺、胆、脾、大肠、小肠", functions: "清热燥湿,泻火解毒,止血,安胎", indications: "湿温暑湿,肺热咳嗽,血热吐衄,胎动不安", level: "一类", mnemonic: "黄芩燥湿安胎", mnemonicExplanation: "黄芩善清上焦肺热,兼能安胎" },
  { id: "h_huanglian", name: "黄连", category: "清热药", property: "苦,寒", meridian: "心、脾、胃、肝、胆、大肠", functions: "清热燥湿,泻火解毒", indications: "湿热痞满,呕吐吞酸,泻痢,心火亢盛", level: "一类", mnemonic: "黄连清心止痢", mnemonicExplanation: "黄连善清心经实火,为治湿热泻痢要药" },
  { id: "h_huangbai", name: "黄柏", category: "清热药", property: "苦,寒", meridian: "肾、膀胱、大肠", functions: "清热燥湿,泻火除蒸,解毒疗疮", indications: "湿热泻痢,黄疸尿赤,骨蒸劳热", level: "一类", mnemonic: "黄柏清下焦湿热", mnemonicExplanation: "黄柏善清下焦湿热,退虚热" },
  { id: "h_zhizi", name: "栀子", category: "清热药", property: "苦,寒", meridian: "心、肺、三焦", functions: "泻火除烦,清热利湿,凉血解毒", indications: "热病心烦,湿热黄疸,血热吐衄", level: "一类", mnemonic: "栀子泻火除烦", mnemonicExplanation: "栀子清三焦之火,尤善清心除烦" },
  { id: "h_dahuang", name: "大黄", category: "泻下药", property: "苦,寒", meridian: "脾、胃、大肠、肝、心包", functions: "泻下攻积,清热泻火,凉血解毒,逐瘀通经", indications: "积滞便秘,血热吐衄,瘀血经闭", level: "一类", mnemonic: "大黄攻积逐瘀", mnemonicExplanation: "大黄为泻下攻积要药,生用后下" },
  { id: "h_huoxiang", name: "藿香", category: "化湿药", property: "辛,微温", meridian: "脾、胃、肺", functions: "化湿醒脾,解暑发表,和中止呕", indications: "湿阻中焦,暑湿感冒,呕吐", level: "一类", mnemonic: "藿香化湿止呕", mnemonicExplanation: "藿香芳香化湿,为暑湿要药" },
  { id: "h_fuling", name: "茯苓", category: "利水渗湿药", property: "甘、淡,平", meridian: "心、肺、脾、肾", functions: "利水渗湿,健脾,宁心", indications: "水肿尿少,痰饮眩悸,脾虚食少,心神不安", level: "一类", mnemonic: "茯苓利水健脾", mnemonicExplanation: "茯苓甘淡利水,兼健脾宁心" },
  { id: "h_fuzi", name: "附子", category: "温里药", property: "辛、甘,大热,有毒", meridian: "心、肾、脾", functions: "回阳救逆,补火助阳,散寒止痛", indications: "亡阳虚脱,肢冷脉微,阳痿宫冷", level: "一类", mnemonic: "附子回阳救逆", mnemonicExplanation: "附子大热,为回阳救逆第一要药(有毒,先煎)" },
  { id: "h_ganjiang", name: "干姜", category: "温里药", property: "辛,热", meridian: "脾、胃、肾、心、肺", functions: "温中散寒,回阳通脉,温肺化饮", indications: "脘腹冷痛,亡阳证,寒饮喘咳", level: "一类", mnemonic: "干姜温中化饮", mnemonicExplanation: "干姜温中散寒,为温中主药" },
  { id: "h_chenpi", name: "陈皮", category: "理气药", property: "辛、苦,温", meridian: "脾、肺", functions: "理气健脾,燥湿化痰", indications: "脘腹胀满,食少吐泻,咳嗽痰多", level: "一类", mnemonic: "陈皮理气化痰", mnemonicExplanation: "陈皮理气燥湿,为治痰要药" },
  { id: "h_sanqi", name: "三七", category: "止血药", property: "甘、微苦,温", meridian: "肝、胃", functions: "散瘀止血,消肿定痛", indications: "咯血吐血,跌打损伤,瘀血肿痛", level: "一类", mnemonic: "三七化瘀止血", mnemonicExplanation: "三七止血不留瘀,化瘀不伤正" },
  { id: "h_chuanxiong", name: "川芎", category: "活血化瘀药", property: "辛,温", meridian: "肝、胆、心包", functions: "活血行气,祛风止痛", indications: "血瘀气滞痛证,头痛,风湿痹痛", level: "一类", mnemonic: "川芎行气活血", mnemonicExplanation: "川芎为血中气药,善治头痛" },
  { id: "h_danggui", name: "当归", category: "补虚药", property: "甘、辛,温", meridian: "肝、心、脾", functions: "补血活血,调经止痛,润肠通便", indications: "血虚萎黄,月经不调,虚寒腹痛,肠燥便秘", level: "一类", mnemonic: "当归补血调经", mnemonicExplanation: "当归为补血要药,兼活血止痛" },
  { id: "h_banxia", name: "半夏", category: "化痰止咳平喘药", property: "辛,温,有毒", meridian: "脾、胃、肺", functions: "燥湿化痰,降逆止呕,消痞散结", indications: "湿痰寒痰,呕吐,心下痞,梅核气", level: "一类", mnemonic: "半夏燥湿止呕", mnemonicExplanation: "半夏为燥湿化痰要药(有毒,姜制)" },
  { id: "h_kuandonghua", name: "款冬花", category: "化痰止咳平喘药", property: "辛、微苦,温", meridian: "肺", functions: "润肺下气,止咳化痰", indications: "新久咳嗽,喘咳痰多,劳嗽咳血", level: "二类", mnemonic: "款冬止咳", mnemonicExplanation: "款冬花为治咳要药,无论寒热虚实皆可配用" },
  { id: "h_suanzaoren", name: "酸枣仁", category: "安神药", property: "甘、酸,平", meridian: "心、肝、胆", functions: "养心补肝,宁心安神,敛汗,生津", indications: "虚烦不眠,惊悸多梦,体虚多汗", level: "一类", mnemonic: "枣仁养心安神", mnemonicExplanation: "酸枣仁为养心安神要药" },
  { id: "h_gouteng", name: "钩藤", category: "平肝息风药", property: "甘,凉", meridian: "肝、心包", functions: "清热平肝,息风定惊", indications: "肝阳上亢,头晕目眩,惊痫抽搐", level: "一类", mnemonic: "钩藤平肝息风", mnemonicExplanation: "钩藤清热息风,后下" },
  { id: "h_renshen", name: "人参", category: "补虚药", property: "甘、微苦,微温", meridian: "脾、肺、心、肾", functions: "大补元气,复脉固脱,补脾益肺,生津养血,安神益智", indications: "体虚欲脱,肢冷脉微,脾虚食少,肺虚喘咳", level: "一类", mnemonic: "人参大补元气", mnemonicExplanation: "人参为大补元气之要药" },
  { id: "h_huangqi", name: "黄芪", category: "补虚药", property: "甘,微温", meridian: "脾、肺", functions: "补气升阳,固表止汗,利水消肿,托毒生肌", indications: "气虚乏力,中气下陷,自汗,水肿,疮疡难溃", level: "一类", mnemonic: "黄芪补气升阳", mnemonicExplanation: "黄芪为补气要药,善升阳固表" },
  { id: "h_gancao", name: "甘草", category: "补虚药", property: "甘,平", meridian: "心、肺、脾、胃", functions: "补脾益气,清热解毒,祛痰止咳,缓急止痛,调和诸药", indications: "脾胃虚弱,咳嗽痰多,脘腹挛急疼痛,药食中毒", level: "一类", mnemonic: "甘草调和诸药", mnemonicExplanation: "甘草为调和诸药之使药(生用泻火,炙用补中)" },
  { id: "h_shanzhuyu", name: "山茱萸", category: "收涩药", property: "酸、涩,微温", meridian: "肝、肾", functions: "补益肝肾,收涩固脱", indications: "眩晕耳鸣,腰膝酸痛,阳痿遗精,大汗虚脱", level: "一类", mnemonic: "茱萸补肝涩脱", mnemonicExplanation: "山茱萸既补肝肾又敛汗固脱" },
  // ===== 数据扩充(2026-08 第二批,按 18 分类补齐常用药) =====
  { id: "h_zisu", name: "紫苏", category: "解表药", property: "辛,温", meridian: "肺、脾", functions: "解表散寒,行气和胃", indications: "风寒感冒,咳嗽呕恶,妊娠呕吐,鱼蟹中毒", level: "二类", mnemonic: "紫苏散寒行气", mnemonicExplanation: "紫苏发表散寒兼理气和中,解鱼蟹毒" },
  { id: "h_shengjiang", name: "生姜", category: "解表药", property: "辛,微温", meridian: "肺、脾、胃", functions: "解表散寒,温中止呕,化痰止咳", indications: "风寒感冒,胃寒呕吐,寒痰咳嗽,解半夏毒", level: "一类", mnemonic: "生姜温胃止呕", mnemonicExplanation: "生姜为呕家圣药,善温胃散寒止呕" },
  { id: "h_jingjie", name: "荆芥", category: "解表药", property: "辛,微温", meridian: "肺、肝", functions: "解表散风,透疹,消疮", indications: "感冒头痛,麻疹不透,风疹瘙痒,疮疡初起", level: "二类", mnemonic: "荆芥透疹散风", mnemonicExplanation: "荆芥轻扬透散,善透疹止痒" },
  { id: "h_fangfeng", name: "防风", category: "解表药", property: "辛、甘,微温", meridian: "膀胱、肝、脾", functions: "祛风解表,胜湿止痛,止痉", indications: "感冒头痛,风湿痹痛,风疹瘙痒,破伤风", level: "二类", mnemonic: "防风祛风圣药", mnemonicExplanation: "防风为风药中之润剂,祛风不伤津" },
  { id: "h_qianghuo", name: "羌活", category: "解表药", property: "辛、苦,温", meridian: "膀胱、肾", functions: "解表散寒,祛风胜湿,止痛", indications: "风寒感冒,头痛项强,风湿痹痛,肩背酸痛", level: "二类", mnemonic: "羌活胜湿止痛", mnemonicExplanation: "羌活善治上半身风寒湿痹与太阳头痛" },
  { id: "h_baizhi", name: "白芷", category: "解表药", property: "辛,温", meridian: "肺、胃、大肠", functions: "解表散寒,祛风止痛,通鼻窍,燥湿止带,消肿排脓", indications: "感冒头痛,眉棱骨痛,鼻塞鼻渊,带下,疮疡肿痛", level: "二类", mnemonic: "白芷通窍止痛", mnemonicExplanation: "白芷善通鼻窍,治阳明头痛与鼻渊要药" },
  { id: "h_bohe", name: "薄荷", category: "解表药", property: "辛,凉", meridian: "肺、肝", functions: "疏散风热,清利头目,利咽透疹,疏肝行气", indications: "风热感冒,头痛目赤,咽喉肿痛,麻疹不透,肝郁气滞", level: "一类", mnemonic: "薄荷疏风利咽", mnemonicExplanation: "薄荷轻清凉散,善清利头目咽喉(后下)" },
  { id: "h_sangye", name: "桑叶", category: "解表药", property: "甘、苦,寒", meridian: "肺、肝", functions: "疏散风热,清肺润燥,平肝明目,凉血止血", indications: "风热感冒,肺热燥咳,头晕头痛,目赤昏花", level: "二类", mnemonic: "桑叶清肺明目", mnemonicExplanation: "桑叶既疏风热又清肝明目,与菊花相须为用" },
  { id: "h_juhua", name: "菊花", category: "解表药", property: "甘、苦,微寒", meridian: "肺、肝", functions: "疏散风热,平肝明目,清热解毒", indications: "风热感冒,头痛眩晕,目赤肿痛,疮痈肿毒", level: "一类", mnemonic: "菊花平肝明目", mnemonicExplanation: "菊花善平肝明目,为治目疾常用药" },
  { id: "h_gegen", name: "葛根", category: "解表药", property: "甘、辛,凉", meridian: "脾、胃、肺", functions: "解肌退热,生津止渴,透疹,升阳止泻,通经活络", indications: "外感发热头痛,项背强痛,消渴,麻疹不透,热泻热痢", level: "二类", mnemonic: "葛根生津升阳", mnemonicExplanation: "葛根解肌生津,善治项背强痛与脾虚泄泻" },
  { id: "h_chaihu", name: "柴胡", category: "解表药", property: "辛、苦,微寒", meridian: "肝、胆、肺", functions: "疏散退热,疏肝解郁,升举阳气", indications: "感冒发热,寒热往来,肝郁气滞,气虚下陷", level: "一类", mnemonic: "柴胡疏肝退热", mnemonicExplanation: "柴胡为和解少阳、疏肝解郁要药" },
  { id: "h_jinyinhua", name: "金银花", category: "清热药", property: "甘,寒", meridian: "肺、心、胃", functions: "清热解毒,疏散风热", indications: "痈肿疔疮,喉痹丹毒,风热感冒,温病发热", level: "一类", mnemonic: "银花清热解毒", mnemonicExplanation: "金银花为清热解毒要药,善治一切痈肿疮毒" },
  { id: "h_lianqiao", name: "连翘", category: "清热药", property: "苦,微寒", meridian: "肺、心、小肠", functions: "清热解毒,消肿散结,疏散风热", indications: "痈疽瘰疬,乳痈丹毒,风热感冒,温病初起", level: "二类", mnemonic: "连翘疮家圣药", mnemonicExplanation: "连翘为疮家圣药,善散结消肿" },
  { id: "h_pugongying", name: "蒲公英", category: "清热药", property: "苦、甘,寒", meridian: "肝、胃", functions: "清热解毒,消肿散结,利尿通淋", indications: "疔疮肿毒,乳痈,瘰疬,目赤,热淋涩痛", level: "二类", mnemonic: "公英消痈通淋", mnemonicExplanation: "蒲公英善治乳痈,兼能利尿通淋" },
  { id: "h_banlangen", name: "板蓝根", category: "清热药", property: "苦,寒", meridian: "心、胃", functions: "清热解毒,凉血利咽", indications: "温疫时毒,发热咽痛,温毒发斑,痄腮", level: "二类", mnemonic: "板蓝凉血利咽", mnemonicExplanation: "板蓝根善治咽喉肿痛与温毒发斑" },
  { id: "h_shengdihuang", name: "生地黄", category: "清热药", property: "甘、苦,寒", meridian: "心、肝、肾", functions: "清热凉血,养阴生津", indications: "热入营血,温毒发斑,吐血衄血,热病伤阴", level: "一类", mnemonic: "生地凉血养阴", mnemonicExplanation: "生地为清热凉血要药,兼养阴生津" },
  { id: "h_xuanshen", name: "玄参", category: "清热药", property: "甘、苦、咸,微寒", meridian: "肺、胃、肾", functions: "清热凉血,滋阴降火,解毒散结", indications: "热入营血,咽喉肿痛,瘰疬痰核,阴虚火旺", level: "二类", mnemonic: "玄参降火散结", mnemonicExplanation: "玄参既清营血热又滋阴降火,善消瘰疬" },
  { id: "h_mudanpi", name: "牡丹皮", category: "清热药", property: "苦、辛,微寒", meridian: "心、肝、肾", functions: "清热凉血,活血化瘀", indications: "热入营血,温毒发斑,吐血衄血,经闭痛经,跌扑伤痛", level: "二类", mnemonic: "丹皮凉血活血", mnemonicExplanation: "牡丹皮凉血而不留瘀,活血而不妄行" },
  { id: "h_chishao", name: "赤芍", category: "清热药", property: "苦,微寒", meridian: "肝", functions: "清热凉血,散瘀止痛", indications: "温毒发斑,吐血衄血,目赤肿痛,肝郁胁痛,经闭痛经", level: "二类", mnemonic: "赤芍凉血散瘀", mnemonicExplanation: "赤芍善凉血活血,治瘀热互结诸证" },
  { id: "h_qinghao", name: "青蒿", category: "清热药", property: "苦、辛,寒", meridian: "肝、胆", functions: "清虚热,除骨蒸,解暑热,截疟", indications: "温邪伤阴,夜热早凉,骨蒸劳热,暑热烦渴,疟疾寒热", level: "二类", mnemonic: "青蒿退蒸截疟", mnemonicExplanation: "青蒿善清透虚热,为治疟要药(后下)" },
  { id: "h_digupi", name: "地骨皮", category: "清热药", property: "甘,寒", meridian: "肺、肝、肾", functions: "凉血除蒸,清肺降火", indications: "阴虚潮热,骨蒸盗汗,肺热咳嗽,血热妄行", level: "二类", mnemonic: "地骨清肺退蒸", mnemonicExplanation: "地骨皮善退虚热骨蒸,又清肺降火" },
  { id: "h_xiakucao", name: "夏枯草", category: "清热药", property: "辛、苦,寒", meridian: "肝、胆", functions: "清肝泻火,明目,散结消肿", indications: "目赤肿痛,头痛眩晕,瘰疬瘿瘤,乳痈肿痛", level: "二类", mnemonic: "夏枯清肝散结", mnemonicExplanation: "夏枯草善清肝火,为治瘰疬瘿瘤要药" },
  { id: "h_mangxiao", name: "芒硝", category: "泻下药", property: "咸、苦,寒", meridian: "胃、大肠", functions: "泻下通便,润燥软坚,清火消肿", indications: "实热积滞,大便燥结,痈肿疮毒,目赤咽痛", level: "二类", mnemonic: "芒硝软坚通便", mnemonicExplanation: "芒硝咸寒软坚,善治燥结便秘(冲服)" },
  { id: "h_huomaren", name: "火麻仁", category: "泻下药", property: "甘,平", meridian: "脾、胃、大肠", functions: "润肠通便", indications: "血虚津亏,肠燥便秘", level: "二类", mnemonic: "麻仁润肠通便", mnemonicExplanation: "火麻仁质润多脂,为润肠通便之缓下药" },
  { id: "h_duhuo", name: "独活", category: "祛风湿药", property: "辛、苦,微温", meridian: "肾、膀胱", functions: "祛风除湿,通痹止痛", indications: "风寒湿痹,腰膝疼痛,少阴伏风头痛", level: "二类", mnemonic: "独活下部痹痛", mnemonicExplanation: "独活善祛下半身风寒湿邪,治腰膝痹痛" },
  { id: "h_weilingxian", name: "威灵仙", category: "祛风湿药", property: "辛、咸,温", meridian: "膀胱", functions: "祛风湿,通经络,止痛,消骨鲠", indications: "风湿痹痛,肢体麻木,筋脉拘挛,骨鲠咽喉", level: "二类", mnemonic: "灵仙通络止痛", mnemonicExplanation: "威灵仙善通十二经络,为治风湿痹痛要药" },
  { id: "h_qinjiao", name: "秦艽", category: "祛风湿药", property: "辛、苦,平", meridian: "胃、肝、胆", functions: "祛风湿,清湿热,止痹痛,退虚热", indications: "风湿痹痛,筋脉拘挛,骨蒸潮热,湿热黄疸", level: "二类", mnemonic: "秦艽祛风退蒸", mnemonicExplanation: "秦艽性平不燥,痹证寒热皆宜,兼退虚热" },
  { id: "h_sangjisheng", name: "桑寄生", category: "祛风湿药", property: "苦、甘,平", meridian: "肝、肾", functions: "祛风湿,补肝肾,强筋骨,安胎", indications: "风湿痹痛,腰膝酸软,胎动不安,崩漏经多", level: "二类", mnemonic: "寄生强骨安胎", mnemonicExplanation: "桑寄生祛风湿而兼补肝肾,为安胎要药" },
  { id: "h_peilan", name: "佩兰", category: "化湿药", property: "辛,平", meridian: "脾、胃、肺", functions: "芳香化湿,醒脾开胃,发表解暑", indications: "湿浊中阻,脘痞呕恶,口中甜腻,暑湿表证", level: "二类", mnemonic: "佩兰醒脾化湿", mnemonicExplanation: "佩兰善化湿醒脾,为治脾瘅口甜要药" },
  { id: "h_houpo", name: "厚朴", category: "化湿药", property: "苦、辛,温", meridian: "脾、胃、肺、大肠", functions: "燥湿消痰,下气除满", indications: "湿滞伤中,脘痞吐泻,食积气滞,痰饮喘咳", level: "二类", mnemonic: "厚朴下气除满", mnemonicExplanation: "厚朴善除胃肠气滞之胀满,兼能平喘" },
  { id: "h_sharen", name: "砂仁", category: "化湿药", property: "辛,温", meridian: "脾、胃", functions: "化湿开胃,温脾止泻,理气安胎", indications: "湿浊中阻,脘痞不饥,脾胃虚寒吐泻,妊娠恶阻", level: "二类", mnemonic: "砂仁化湿安胎", mnemonicExplanation: "砂仁芳香化湿行气,为安胎常用药(后下)" },
  { id: "h_zhuling", name: "猪苓", category: "利水渗湿药", property: "甘、淡,平", meridian: "肾、膀胱", functions: "利水渗湿", indications: "小便不利,水肿胀满,泄泻,淋浊带下", level: "二类", mnemonic: "猪苓利水渗湿", mnemonicExplanation: "猪苓利水之力强于茯苓,为利水要药" },
  { id: "h_zexie", name: "泽泻", category: "利水渗湿药", property: "甘,寒", meridian: "肾、膀胱", functions: "利水渗湿,泄热,化浊降脂", indications: "小便不利,水肿胀满,泄泻尿少,痰饮眩晕,高脂血症", level: "二类", mnemonic: "泽泻渗湿泄热", mnemonicExplanation: "泽泻利水而兼泄肾经虚火" },
  { id: "h_yiyiren", name: "薏苡仁", category: "利水渗湿药", property: "甘、淡,凉", meridian: "脾、胃、肺", functions: "利水渗湿,健脾止泻,除痹,排脓,解毒散结", indications: "水肿脚气,脾虚泄泻,湿痹拘挛,肺痈肠痈,赘疣", level: "二类", mnemonic: "薏米健脾除痹", mnemonicExplanation: "薏苡仁利水健脾而不伤正,兼除湿痹" },
  { id: "h_cheqianzi", name: "车前子", category: "利水渗湿药", property: "甘,微寒", meridian: "肝、肾、肺、小肠", functions: "清热利尿通淋,渗湿止泻,明目,祛痰", indications: "热淋涩痛,水肿胀满,暑湿泄泻,目赤肿痛,痰热咳嗽", level: "二类", mnemonic: "车前通淋明目", mnemonicExplanation: "车前子善清膀胱湿热,兼明目祛痰(包煎)" },
  { id: "h_jinqiancao", name: "金钱草", category: "利水渗湿药", property: "甘、咸,微寒", meridian: "肝、胆、肾、膀胱", functions: "利湿退黄,利尿通淋,解毒消肿", indications: "湿热黄疸,胆胀胁痛,石淋热淋,痈肿疔疮", level: "二类", mnemonic: "金钱排石退黄", mnemonicExplanation: "金钱草为治石淋要药,善利湿退黄" },
  { id: "h_yinchen", name: "茵陈", category: "利水渗湿药", property: "苦、辛,微寒", meridian: "脾、胃、肝、胆", functions: "清利湿热,利胆退黄", indications: "黄疸尿少,湿温暑湿,湿疮瘙痒", level: "二类", mnemonic: "茵陈退黄要药", mnemonicExplanation: "茵陈为治黄疸之要药,无论阳黄阴黄皆可用" },
  { id: "h_rougui", name: "肉桂", category: "温里药", property: "辛、甘,大热", meridian: "肾、脾、心、肝", functions: "补火助阳,散寒止痛,温通经脉,引火归元", indications: "命门火衰,肢冷脉微,脘腹冷痛,经闭痛经,虚阳上浮", level: "二类", mnemonic: "肉桂补火助阳", mnemonicExplanation: "肉桂善补命门之火,引火归元(后下)" },
  { id: "h_wuzhuyu", name: "吴茱萸", category: "温里药", property: "辛、苦,热", meridian: "肝、肾、脾、胃", functions: "散寒止痛,降逆止呕,助阳止泻", indications: "厥阴头痛,寒疝腹痛,呕吐吞酸,五更泄泻", level: "二类", mnemonic: "茱萸散寒止呕", mnemonicExplanation: "吴茱萸善散肝经寒邪,治厥阴巅顶头痛" },
  { id: "h_dingxiang", name: "丁香", category: "温里药", property: "辛,温", meridian: "脾、胃、肾", functions: "温中降逆,散寒止痛,温肾助阳", indications: "脾胃虚寒,呃逆呕吐,脘腹冷痛,阳痿宫冷", level: "二类", mnemonic: "丁香温胃止呃", mnemonicExplanation: "丁香善降逆气,为治虚寒呃逆要药" },
  { id: "h_zhishi", name: "枳实", category: "理气药", property: "苦、辛、酸,微寒", meridian: "脾、胃", functions: "破气消积,化痰散痞", indications: "积滞内停,痞满胀痛,泻痢后重,大便不通,痰滞胸脘", level: "二类", mnemonic: "枳实破气消痞", mnemonicExplanation: "枳实破气力峻,善消痞除满" },
  { id: "h_muxiang", name: "木香", category: "理气药", property: "辛、苦,温", meridian: "脾、胃、大肠、胆、三焦", functions: "行气止痛,健脾消食", indications: "脘腹胀痛,泻痢后重,食积不消,不思饮食", level: "二类", mnemonic: "木香行气止痛", mnemonicExplanation: "木香为行气止痛要药,善调中焦气滞" },
  { id: "h_xiangfu", name: "香附", category: "理气药", property: "辛、微苦、微甘,平", meridian: "肝、脾、三焦", functions: "疏肝解郁,理气宽中,调经止痛", indications: "肝郁气滞,胸胁胀痛,疝气疼痛,月经不调,乳房胀痛", level: "二类", mnemonic: "香附气病总司", mnemonicExplanation: "香附为妇科调经之要药,善疏肝理气" },
  { id: "h_chenxiang", name: "沉香", category: "理气药", property: "辛、苦,微温", meridian: "脾、胃、肾", functions: "行气止痛,温中止呕,纳气平喘", indications: "胸腹胀闷疼痛,胃寒呕吐呃逆,肾虚气逆喘促", level: "二类", mnemonic: "沉香纳气平喘", mnemonicExplanation: "沉香善降逆气,纳肾气以平喘(后下)" },
  { id: "h_xiebai", name: "薤白", category: "理气药", property: "辛、苦,温", meridian: "心、肺、胃、大肠", functions: "通阳散结,行气导滞", indications: "胸痹心痛,脘腹痞满胀痛,泻痢后重", level: "二类", mnemonic: "薤白通阳宽胸", mnemonicExplanation: "薤白善通胸阳,为治胸痹要药" },
  { id: "h_shanzha", name: "山楂", category: "消食药", property: "酸、甘,微温", meridian: "脾、胃、肝", functions: "消食健胃,行气散瘀,化浊降脂", indications: "肉食积滞,胃脘胀满,泻痢腹痛,瘀血经闭,高脂血症", level: "一类", mnemonic: "山楂消肉化积", mnemonicExplanation: "山楂善消肉食积滞,兼能活血化瘀" },
  { id: "h_shenqu", name: "神曲", category: "消食药", property: "甘、辛,温", meridian: "脾、胃", functions: "消食和胃", indications: "饮食积滞,脘腹胀满,食少纳呆", level: "二类", mnemonic: "神曲消食和胃", mnemonicExplanation: "神曲善消面食积滞,兼能解表退乳" },
  { id: "h_maiya", name: "麦芽", category: "消食药", property: "甘,平", meridian: "脾、胃、肝", functions: "行气消食,健脾开胃,回乳消胀", indications: "食积不消,脘腹胀痛,脾虚食少,乳汁郁积,断乳", level: "二类", mnemonic: "麦芽消面回乳", mnemonicExplanation: "麦芽善消米面薯芋食积,大量用回乳" },
  { id: "h_jineijin", name: "鸡内金", category: "消食药", property: "甘,平", meridian: "脾、胃、小肠、膀胱", functions: "健胃消食,涩精止遗,通淋化石", indications: "食积不化,消化不良,小儿疳积,遗尿遗精,石淋涩痛", level: "二类", mnemonic: "鸡内金化石消积", mnemonicExplanation: "鸡内金消食力强,兼能化石通淋" },
  { id: "h_shijunzi", name: "使君子", category: "驱虫药", property: "甘,温", meridian: "脾、胃", functions: "杀虫消积", indications: "蛔虫病,蛲虫病,虫积腹痛,小儿疳积", level: "二类", mnemonic: "使君驱蛔消疳", mnemonicExplanation: "使君子为驱蛔要药,味甘小儿喜服(忌热茶)" },
  { id: "h_binglang", name: "槟榔", category: "驱虫药", property: "苦、辛,温", meridian: "胃、大肠", functions: "杀虫,消积,行气,利水,截疟", indications: "绦虫蛔虫等虫积腹痛,食积气滞,水肿脚气,疟疾", level: "二类", mnemonic: "槟榔驱绦消积", mnemonicExplanation: "槟榔善驱绦虫,兼行气利水" },
  { id: "h_baimaogen", name: "白茅根", category: "止血药", property: "甘,寒", meridian: "肺、胃、膀胱", functions: "凉血止血,清热利尿", indications: "血热吐血衄血,尿血血淋,热病烦渴,热淋涩痛", level: "二类", mnemonic: "茅根凉血利尿", mnemonicExplanation: "白茅根凉血止血而兼利尿,为治尿血要药" },
  { id: "h_diyu", name: "地榆", category: "止血药", property: "苦、酸、涩,微寒", meridian: "肝、大肠", functions: "凉血止血,解毒敛疮", indications: "便血痔血,血痢崩漏,水火烫伤,痈肿疮毒", level: "二类", mnemonic: "地榆凉血敛疮", mnemonicExplanation: "地榆善治下焦血热出血,外敷治烫伤" },
  { id: "h_baiji", name: "白及", category: "止血药", property: "苦、甘、涩,微寒", meridian: "肺、胃、肝", functions: "收敛止血,消肿生肌", indications: "咯血吐血,外伤出血,疮疡肿毒,皮肤皲裂", level: "二类", mnemonic: "白及敛肺止血", mnemonicExplanation: "白及收敛止血力强,善治肺胃出血(畏乌头)" },
  { id: "h_aiye", name: "艾叶", category: "止血药", property: "辛、苦,温", meridian: "肝、脾、肾", functions: "温经止血,散寒止痛,调经安胎", indications: "虚寒性吐血衄血,崩漏下血,少腹冷痛,经寒不调,胎动不安", level: "二类", mnemonic: "艾叶温经安胎", mnemonicExplanation: "艾叶善温经止血,为妇科安胎要药,灸治常用" },
  { id: "h_daji", name: "大蓟", category: "止血药", property: "甘、苦,凉", meridian: "心、肝", functions: "凉血止血,散瘀解毒消痈", indications: "衄血吐血,尿血便血,崩漏,外伤出血,痈肿疮毒", level: "二类", mnemonic: "大蓟凉血散瘀", mnemonicExplanation: "大蓟凉血止血兼散瘀消痈,止血不留瘀" },
  { id: "h_danshen", name: "丹参", category: "活血化瘀药", property: "苦,微寒", meridian: "心、肝", functions: "活血祛瘀,通经止痛,清心除烦,凉血消痈", indications: "胸痹心痛,脘腹胁痛,癥瘕积聚,月经不调,心烦不眠", level: "一类", mnemonic: "丹参祛瘀生新", mnemonicExplanation: "丹参为活血化瘀要药,兼清心除烦" },
  { id: "h_taoren", name: "桃仁", category: "活血化瘀药", property: "苦、甘,平", meridian: "心、肝、大肠", functions: "活血祛瘀,润肠通便,止咳平喘", indications: "经闭痛经,癥瘕痞块,跌打损伤,肠燥便秘,咳嗽气喘", level: "二类", mnemonic: "桃仁祛瘀通便", mnemonicExplanation: "桃仁活血力缓兼润肠,为活血化瘀常用药" },
  { id: "h_honghua", name: "红花", category: "活血化瘀药", property: "辛,温", meridian: "心、肝", functions: "活血通经,散瘀止痛", indications: "经闭痛经,恶露不行,癥瘕痞块,跌打损伤,疮疡肿痛", level: "一类", mnemonic: "红花活血通经", mnemonicExplanation: "红花为活血通经要药,少用活血多用破血" },
  { id: "h_yanhusuo", name: "延胡索", category: "活血化瘀药", property: "辛、苦,温", meridian: "肝、脾", functions: "活血,行气,止痛", indications: "气血瘀滞诸痛证,胸痹心痛,脘腹疼痛,跌扑伤痛", level: "二类", mnemonic: "元胡行气止痛", mnemonicExplanation: "延胡索行血中气滞,为止痛要药(醋制增效)" },
  { id: "h_yimucao", name: "益母草", category: "活血化瘀药", property: "苦、辛,微寒", meridian: "肝、心包、膀胱", functions: "活血调经,利尿消肿,清热解毒", indications: "月经不调,痛经经闭,恶露不尽,水肿尿少,疮疡肿毒", level: "二类", mnemonic: "益母调经利水", mnemonicExplanation: "益母草为妇科经产要药,兼利水消肿" },
  { id: "h_niuxi", name: "牛膝", category: "活血化瘀药", property: "苦、甘、酸,平", meridian: "肝、肾", functions: "逐瘀通经,补肝肾,强筋骨,利尿通淋,引血下行", indications: "经闭痛经,腰膝酸痛,筋骨无力,淋证水肿,头痛眩晕", level: "二类", mnemonic: "牛膝引血下行", mnemonicExplanation: "牛膝善引血引火下行,又补肝肾强筋骨(怀牛膝佳)" },
  { id: "h_ruxiang", name: "乳香", category: "活血化瘀药", property: "辛、苦,温", meridian: "心、肝、脾", functions: "活血行气止痛,消肿生肌", indications: "跌打损伤,疮疡肿痛,胸痹心痛,风湿痹痛", level: "二类", mnemonic: "乳香活血定痛", mnemonicExplanation: "乳香活血行气止痛,为伤科要药" },
  { id: "h_ezhu", name: "莪术", category: "活血化瘀药", property: "辛、苦,温", meridian: "肝、脾", functions: "行气破血,消积止痛", indications: "癥瘕痞块,瘀血经闭,胸痹心痛,食积脘腹胀痛", level: "二类", mnemonic: "莪术破血消癥", mnemonicExplanation: "莪术破血行气力峻,善消癥瘕积块" },
  { id: "h_jiegeng", name: "桔梗", category: "化痰止咳平喘药", property: "苦、辛,平", meridian: "肺", functions: "宣肺,利咽,祛痰,排脓", indications: "咳嗽痰多,胸闷不畅,咽痛音哑,肺痈吐脓", level: "二类", mnemonic: "桔梗宣肺利咽", mnemonicExplanation: "桔梗为肺经气分要药,善宣肺祛痰排脓" },
  { id: "h_chuanbeimu", name: "川贝母", category: "化痰止咳平喘药", property: "苦、甘,微寒", meridian: "肺、心", functions: "清热润肺,化痰止咳,散结消痈", indications: "肺热燥咳,干咳少痰,阴虚劳嗽,瘰疬乳痈", level: "一类", mnemonic: "川贝润肺散结", mnemonicExplanation: "川贝性润,善治肺虚燥咳(反乌头)" },
  { id: "h_zhebeimu", name: "浙贝母", category: "化痰止咳平喘药", property: "苦,寒", meridian: "肺、心", functions: "清热化痰止咳,解毒散结消痈", indications: "风热咳嗽,痰火咳嗽,瘰疬瘿瘤,痈疮肿毒", level: "二类", mnemonic: "浙贝清热散结", mnemonicExplanation: "浙贝苦寒开泄,善治外感痰热与瘰疬(反乌头)" },
  { id: "h_gualou", name: "瓜蒌", category: "化痰止咳平喘药", property: "甘、微苦,寒", meridian: "肺、胃、大肠", functions: "清热涤痰,宽胸散结,润燥滑肠", indications: "肺热咳嗽,痰浊黄稠,胸痹心痛,结胸痞满,肠燥便秘", level: "二类", mnemonic: "瓜蒌宽胸涤痰", mnemonicExplanation: "瓜蒌善涤痰宽胸,为治胸痹要药(反乌头)" },
  { id: "h_zhuru", name: "竹茹", category: "化痰止咳平喘药", property: "甘,微寒", meridian: "肺、胃、心", functions: "清热化痰,除烦止呕", indications: "痰热咳嗽,胆火挟痰,烦热呕吐,胎动不安", level: "二类", mnemonic: "竹茹清热止呕", mnemonicExplanation: "竹茹善清胃热止呕,为治胃热呕吐要药" },
  { id: "h_kuxingren", name: "苦杏仁", category: "化痰止咳平喘药", property: "苦,微温,有毒", meridian: "肺、大肠", functions: "降气止咳平喘,润肠通便", indications: "咳嗽气喘,胸满痰多,肠燥便秘", level: "一类", mnemonic: "杏仁降气平喘", mnemonicExplanation: "苦杏仁善降肺气止咳喘,兼润肠(有毒,用量宜慎)" },
  { id: "h_zisuzi", name: "紫苏子", category: "化痰止咳平喘药", property: "辛,温", meridian: "肺、大肠", functions: "降气化痰,止咳平喘,润肠通便", indications: "痰壅气逆,咳嗽气喘,肠燥便秘", level: "二类", mnemonic: "苏子降气化痰", mnemonicExplanation: "紫苏子善降肺气化痰,为治喘咳要药" },
  { id: "h_baibu", name: "百部", category: "化痰止咳平喘药", property: "甘、苦,微温", meridian: "肺", functions: "润肺下气止咳,杀虫灭虱", indications: "新久咳嗽,肺痨咳嗽,百日咳,蛲虫,头虱", level: "二类", mnemonic: "百部润肺止咳", mnemonicExplanation: "百部甘润苦降,治新久虚劳咳嗽皆宜" },
  { id: "h_sangbaipi", name: "桑白皮", category: "化痰止咳平喘药", property: "甘,寒", meridian: "肺", functions: "泻肺平喘,利水消肿", indications: "肺热喘咳,水饮停肺,胀满喘急,水肿小便不利", level: "二类", mnemonic: "桑皮泻肺利水", mnemonicExplanation: "桑白皮善泻肺中水气而平喘,兼利水消肿" },
  { id: "h_yuanzhi", name: "远志", category: "安神药", property: "苦、辛,温", meridian: "心、肾、肺", functions: "安神益智,祛痰开窍,消散痈肿", indications: "心肾不交,失眠多梦,健忘惊悸,咳嗽痰多,痈疽疮肿", level: "二类", mnemonic: "远志安神祛痰", mnemonicExplanation: "远志交通心肾以安神,兼祛痰开窍" },
  { id: "h_baiziren", name: "柏子仁", category: "安神药", property: "甘,平", meridian: "心、肾、大肠", functions: "养心安神,润肠通便,止汗", indications: "阴血不足,虚烦失眠,心悸怔忡,肠燥便秘,阴虚盗汗", level: "二类", mnemonic: "柏子养心安神", mnemonicExplanation: "柏子仁养心安神而兼润肠,为养心常用药" },
  { id: "h_longgu", name: "龙骨", category: "安神药", property: "甘、涩,平", meridian: "心、肝、肾", functions: "镇惊安神,平肝潜阳,收敛固涩", indications: "心神不宁,心悸失眠,惊痫癫狂,肝阳眩晕,滑脱诸证", level: "二类", mnemonic: "龙骨镇惊固涩", mnemonicExplanation: "龙骨生用镇惊潜阳,煅用收敛固涩(先煎)" },
  { id: "h_hehuanpi", name: "合欢皮", category: "安神药", property: "甘,平", meridian: "心、肝、肺", functions: "解郁安神,活血消肿", indications: "心神不宁,忿怒忧郁,烦躁失眠,跌扑伤痛,疮痈肿毒", level: "二类", mnemonic: "合欢解郁安神", mnemonicExplanation: "合欢皮善解郁安神,为悦心安神要药" },
  { id: "h_tianma", name: "天麻", category: "平肝息风药", property: "甘,平", meridian: "肝", functions: "息风止痉,平抑肝阳,祛风通络", indications: "肝风内动,惊痫抽搐,眩晕头痛,肢体麻木,风湿痹痛", level: "一类", mnemonic: "天麻平肝息风", mnemonicExplanation: "天麻为止眩晕要药,平肝息风而不燥" },
  { id: "h_shijueming", name: "石决明", category: "平肝息风药", property: "咸,寒", meridian: "肝", functions: "平肝潜阳,清肝明目", indications: "肝阳上亢,头晕目眩,目赤翳障,视物昏花", level: "二类", mnemonic: "石决明潜阳明目", mnemonicExplanation: "石决明为平肝潜阳、清肝明目要药(先煎)" },
  { id: "h_quanxie", name: "全蝎", category: "平肝息风药", property: "辛,平,有毒", meridian: "肝", functions: "息风镇痉,通络止痛,攻毒散结", indications: "小儿惊风,抽搐痉挛,中风口歪,半身不遂,风湿顽痹", level: "二类", mnemonic: "全蝎镇痉通络", mnemonicExplanation: "全蝎善息风止痉,为治痉挛抽搐要药(有毒)" },
  { id: "h_lingyangjiao", name: "羚羊角", category: "平肝息风药", property: "咸,寒", meridian: "肝、心", functions: "平肝息风,清肝明目,散血解毒", indications: "肝风内动,惊痫抽搐,肝阳头痛眩晕,温毒发斑", level: "二类", mnemonic: "羚角息风清热", mnemonicExplanation: "羚羊角为息风止痉要药,尤宜热极生风(磨粉冲服)" },
  { id: "h_dilong", name: "地龙", category: "平肝息风药", property: "咸,寒", meridian: "肝、脾、膀胱", functions: "清热定惊,通络,平喘,利尿", indications: "高热神昏,惊痫抽搐,关节痹痛,肺热喘咳,热结尿闭", level: "二类", mnemonic: "地龙清热通络", mnemonicExplanation: "地龙善清热息风通络,兼平喘利尿" },
  { id: "h_shichangpu", name: "石菖蒲", category: "开窍药", property: "辛、苦,温", meridian: "心、胃", functions: "开窍豁痰,醒神益智,化湿开胃", indications: "痰蒙清窍,神昏癫痫,健忘失眠,耳鸣耳聋,脘痞不饥", level: "二类", mnemonic: "菖蒲开窍益智", mnemonicExplanation: "石菖蒲善豁痰开窍醒神,兼化湿开胃" },
  { id: "h_bingpian", name: "冰片", category: "开窍药", property: "辛、苦,微寒", meridian: "心、脾、肺", functions: "开窍醒神,清热止痛", indications: "热病神昏,痉厥,中风痰厥,目赤口疮,咽喉肿痛", level: "二类", mnemonic: "冰片开窍止痛", mnemonicExplanation: "冰片辛香走窜,善开窍醒神(不入煎剂,研末用)" },
  { id: "h_shexiang", name: "麝香", category: "开窍药", property: "辛,温", meridian: "心、脾", functions: "开窍醒神,活血通经,消肿止痛", indications: "热病神昏,中风痰厥,经闭癥瘕,跌打损伤,疮疡肿毒", level: "二类", mnemonic: "麝香开窍醒神", mnemonicExplanation: "麝香为开窍醒神第一要药,兼活血通经(孕妇禁用)" },
  { id: "h_dangshen", name: "党参", category: "补虚药", property: "甘,平", meridian: "脾、肺", functions: "健脾益肺,养血生津", indications: "脾肺气虚,食少倦怠,咳嗽虚喘,气血不足,面色萎黄", level: "二类", mnemonic: "党参健脾益气", mnemonicExplanation: "党参补脾肺气之力似人参而力缓,为常用补气药" },
  { id: "h_baizhu", name: "白术", category: "补虚药", property: "苦、甘,温", meridian: "脾、胃", functions: "健脾益气,燥湿利水,止汗,安胎", indications: "脾虚食少,腹胀泄泻,痰饮眩悸,水肿,自汗,胎动不安", level: "一类", mnemonic: "白术健脾燥湿", mnemonicExplanation: "白术为补气健脾第一要药,善燥湿利水" },
  { id: "h_shanyao", name: "山药", category: "补虚药", property: "甘,平", meridian: "脾、肺、肾", functions: "补脾养胃,生津益肺,补肾涩精", indications: "脾虚食少,久泻不止,肺虚喘咳,肾虚遗精,带下尿频", level: "二类", mnemonic: "山药平补三脏", mnemonicExplanation: "山药甘平补脾肺肾,为平补三焦常用药" },
  { id: "h_dazao", name: "大枣", category: "补虚药", property: "甘,温", meridian: "脾、胃、心", functions: "补中益气,养血安神", indications: "脾虚食少,乏力便溏,妇人脏躁,营卫不和", level: "二类", mnemonic: "大枣补中养血", mnemonicExplanation: "大枣补中益气,养血安神,为调和营卫常用药" },
  { id: "h_shudihuang", name: "熟地黄", category: "补虚药", property: "甘,微温", meridian: "肝、肾", functions: "补血滋阴,益精填髓", indications: "血虚萎黄,心悸怔忡,月经不调,肝肾阴虚,腰膝酸软", level: "一类", mnemonic: "熟地补血填髓", mnemonicExplanation: "熟地黄为补血要药,善滋阴填精(滋腻碍胃)" },
  { id: "h_heshouwu", name: "何首乌", category: "补虚药", property: "苦、甘、涩,微温", meridian: "肝、肾", functions: "补肝肾,益精血,乌须发,强筋骨", indications: "血虚萎黄,眩晕耳鸣,须发早白,腰膝酸软,肠燥便秘", level: "二类", mnemonic: "首乌乌须益精", mnemonicExplanation: "制首乌补肝肾益精血,为乌须发要药" },
  { id: "h_ejiao", name: "阿胶", category: "补虚药", property: "甘,平", meridian: "肺、肝、肾", functions: "补血滋阴,润燥,止血", indications: "血虚萎黄,眩晕心悸,肌痿无力,吐血衄血,便血崩漏", level: "二类", mnemonic: "阿胶补血润燥", mnemonicExplanation: "阿胶为补血要药,兼滋阴润燥止血(烊化服)" },
  { id: "h_maidong", name: "麦冬", category: "补虚药", property: "甘、微苦,微寒", meridian: "心、肺、胃", functions: "养阴生津,润肺清心", indications: "肺燥干咳,阴虚劳嗽,喉痹咽痛,津伤口渴,心烦失眠", level: "一类", mnemonic: "麦冬养阴润肺", mnemonicExplanation: "麦冬善养肺胃心三经之阴,为滋阴要药" },
  { id: "h_gouqizi", name: "枸杞子", category: "补虚药", property: "甘,平", meridian: "肝、肾", functions: "滋补肝肾,益精明目", indications: "虚劳精亏,腰膝酸痛,眩晕耳鸣,内热消渴,目昏不明", level: "一类", mnemonic: "枸杞滋补明目", mnemonicExplanation: "枸杞子平补肝肾精血,为明目常用药" },
  { id: "h_duzhong", name: "杜仲", category: "补虚药", property: "甘,温", meridian: "肝、肾", functions: "补肝肾,强筋骨,安胎", indications: "腰膝酸软,筋骨无力,头晕目眩,妊娠漏血,胎动不安", level: "二类", mnemonic: "杜仲强骨安胎", mnemonicExplanation: "杜仲补肝肾强腰膝,为安胎要药" },
  { id: "h_xuduan", name: "续断", category: "补虚药", property: "苦、辛,微温", meridian: "肝、肾", functions: "补肝肾,强筋骨,续折伤,止崩漏", indications: "腰膝酸软,风湿痹痛,跌扑损伤,筋伤骨折,崩漏胎漏", level: "二类", mnemonic: "续断接骨安胎", mnemonicExplanation: "续断善续筋接骨,兼补肝肾安胎" },
  { id: "h_yinyanghuo", name: "淫羊藿", category: "补虚药", property: "辛、甘,温", meridian: "肝、肾", functions: "补肾壮阳,祛风除湿", indications: "肾阳不足,阳痿遗精,腰膝冷痛,风湿痹痛,筋骨痿软", level: "二类", mnemonic: "淫羊藿壮阳", mnemonicExplanation: "淫羊藿补肾壮阳而兼祛风湿,为壮阳要药" },
  { id: "h_wuweizi", name: "五味子", category: "收涩药", property: "酸、甘,温", meridian: "肺、心、肾", functions: "收敛固涩,益气生津,补肾宁心", indications: "久嗽虚喘,梦遗滑精,遗尿尿频,久泻不止,自汗盗汗", level: "二类", mnemonic: "五味敛肺滋肾", mnemonicExplanation: "五味子五味俱全以酸为主,善敛肺滋肾止汗" },
  { id: "h_wumei", name: "乌梅", category: "收涩药", property: "酸、涩,平", meridian: "肝、脾、肺、大肠", functions: "敛肺,涩肠,生津,安蛔", indications: "肺虚久咳,久泻久痢,虚热消渴,蛔厥呕吐腹痛", level: "二类", mnemonic: "乌梅敛肺安蛔", mnemonicExplanation: "乌梅酸涩收敛,善敛肺涩肠,安蛔止痛" },
  { id: "h_roudoukou", name: "肉豆蔻", category: "收涩药", property: "辛,温", meridian: "脾、胃、大肠", functions: "温中行气,涩肠止泻", indications: "脾胃虚寒,久泻不止,脘腹胀痛,食少呕吐", level: "二类", mnemonic: "肉蔻涩肠止泻", mnemonicExplanation: "肉豆蔻温中涩肠,治虚寒久泻要药(煨用)" },
  { id: "h_lianzi", name: "莲子", category: "收涩药", property: "甘、涩,平", meridian: "脾、肾、心", functions: "补脾止泻,止带,益肾涩精,养心安神", indications: "脾虚泄泻,带下,遗精滑精,虚烦失眠", level: "二类", mnemonic: "莲子补脾涩精", mnemonicExplanation: "莲子平补脾肾,涩精止泻兼养心安神" },
  { id: "h_jinyingzi", name: "金樱子", category: "收涩药", property: "酸、甘、涩,平", meridian: "肾、膀胱、大肠", functions: "固精缩尿,固崩止带,涩肠止泻", indications: "遗精滑精,遗尿尿频,崩漏带下,久泻久痢", level: "二类", mnemonic: "金樱固精缩尿", mnemonicExplanation: "金樱子酸涩收敛,善固精缩尿止带" },
];

async function main() {
  // 1. 建分类(幂等)
  const catIdMap = new Map<string, number>();
  for (const c of CATEGORIES) {
    const existing = await db.herbCategory.findUnique({ where: { name: c.name } });
    if (existing) {
      catIdMap.set(c.name, existing.id);
      continue;
    }
    const created = await db.herbCategory.create({
      data: { name: c.name, sortOrder: c.sortOrder, description: "" },
    });
    catIdMap.set(c.name, created.id);
  }
  console.log(`✅ 分类就绪(${catIdMap.size} 个)`);

  // 2. 插入中药(幂等:name+source 唯一跳过)
  const SOURCE = "数据整理自《中国药典》2020年版公开条目(供学习参考)";
  let inserted = 0;
  let skipped = 0;
  for (const h of SEED_HERBS) {
    const categoryId = catIdMap.get(h.category);
    if (!categoryId) throw new Error(`分类缺失: ${h.category}`);
    const existing = await db.herb.findUnique({
      where: { name_source: { name: h.name, source: SOURCE } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.herb.create({
      data: {
        id: h.id,
        name: h.name,
        source: SOURCE,
        categoryId,
        property: h.property,
        meridian: h.meridian,
        functions: h.functions,
        indications: h.indications,
        mnemonic: h.mnemonic ?? "",
        mnemonicExplanation: h.mnemonicExplanation ?? "",
        level: h.level,
        sortOrder: 0,
      },
    });
    inserted++;
  }
  console.log(`✅ 中药种子完成:新增 ${inserted} 味,跳过 ${skipped} 味(已存在)`);

  const total = await db.herb.count();
  console.log(`📊 生产库当前中药总数: ${total} 味`);
}

main()
  .catch((e) => {
    console.error("❌ 种子失败:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
