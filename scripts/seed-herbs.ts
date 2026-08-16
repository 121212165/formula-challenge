// 中药种子数据生成脚本(Phase 1 验证数据链路)
// 数据来源:《中国药典》2020 年版公开条目 + 高校公开教学大纲(供学习参考)
// 运行: npx tsx scripts/seed-herbs.ts
// 说明:种子 24 味验证链路,后续按周增量扩充至 300+ 味(众包纠错见需求文档 4.2)
import { validateHerbSet, type HerbEntry } from "../src/lib/subject";

// 分类映射:分类名 → categoryId(sortOrder 按教材章节)
const CATEGORY_ID: Record<string, number> = {
  解表药: 1,
  清热药: 2,
  泻下药: 3,
  祛风湿药: 4,
  化湿药: 5,
  利水渗湿药: 6,
  温里药: 7,
  理气药: 8,
  消食药: 9,
  驱虫药: 10,
  止血药: 11,
  活血化瘀药: 12,
  化痰止咳平喘药: 13,
  安神药: 14,
  平肝息风药: 15,
  开窍药: 16,
  补虚药: 17,
  收涩药: 18,
};

// 种子条目含 mnemonic 字段,输出时按 HerbEntry 取子集
type SeedHerb = Omit<HerbEntry, "category"> & {
  category: string;
  mnemonic?: string;
  mnemonicExplanation?: string;
};

const HERBS: SeedHerb[] = [
  // ===== 解表药 =====
  { id: "h_mahuang", name: "麻黄", category: "解表药", property: "辛、微苦,温", meridian: "肺、膀胱", functions: "发汗解表,宣肺平喘,利水消肿", indications: "风寒感冒,咳嗽气喘,风水水肿", level: "一类", mnemonic: "麻黄辛温,发汗解表,宣肺平喘", mnemonicExplanation: "麻黄发汗力强,为发汗解表第一要药" },
  { id: "h_guizhi", name: "桂枝", category: "解表药", property: "辛、甘,温", meridian: "心、肺、膀胱", functions: "发汗解肌,温通经脉,助阳化气", indications: "风寒感冒,寒凝血滞诸痛,痰饮水肿", level: "一类", mnemonic: "桂枝辛温,解肌通脉", mnemonicExplanation: "桂枝善温通经脉,和营解肌" },
  { id: "h_baishao", name: "白芍", category: "补虚药", property: "苦、酸,微寒", meridian: "肝、脾", functions: "养血敛阴,柔肝止痛,平抑肝阳", indications: "血虚萎黄,肝阳上亢,腹痛拘挛", level: "一类", mnemonic: "白芍养血柔肝", mnemonicExplanation: "白芍养血敛阴,与桂枝配伍调和营卫" },
  // ===== 清热药 =====
  { id: "h_shigao", name: "石膏", category: "清热药", property: "甘、辛,大寒", meridian: "肺、胃", functions: "生用清热泻火,除烦止渴;煅用收湿敛疮", indications: "气分实热证,肺热喘咳,胃火牙痛", level: "一类", mnemonic: "石膏大寒清气热", mnemonicExplanation: "石膏为清泻肺胃气分实热之要药" },
  { id: "h_zhimu", name: "知母", category: "清热药", property: "苦、甘,寒", meridian: "肺、胃、肾", functions: "清热泻火,滋阴润燥", indications: "热病烦渴,肺热燥咳,骨蒸潮热", level: "一类", mnemonic: "知母清润三经", mnemonicExplanation: "知母既清肺胃实热,又滋肾阴" },
  { id: "h_huangqin", name: "黄芩", category: "清热药", property: "苦,寒", meridian: "肺、胆、脾、大肠、小肠", functions: "清热燥湿,泻火解毒,止血,安胎", indications: "湿温暑湿,肺热咳嗽,血热吐衄,胎动不安", level: "一类", mnemonic: "黄芩燥湿安胎", mnemonicExplanation: "黄芩善清上焦肺热,兼能安胎" },
  { id: "h_huanglian", name: "黄连", category: "清热药", property: "苦,寒", meridian: "心、脾、胃、肝、胆、大肠", functions: "清热燥湿,泻火解毒", indications: "湿热痞满,呕吐吞酸,泻痢,心火亢盛", level: "一类", mnemonic: "黄连清心止痢", mnemonicExplanation: "黄连善清心经实火,为治湿热泻痢要药" },
  { id: "h_huangbai", name: "黄柏", category: "清热药", property: "苦,寒", meridian: "肾、膀胱、大肠", functions: "清热燥湿,泻火除蒸,解毒疗疮", indications: "湿热泻痢,黄疸尿赤,骨蒸劳热", level: "一类", mnemonic: "黄柏清下焦湿热", mnemonicExplanation: "黄柏善清下焦湿热,退虚热" },
  { id: "h_zhizi", name: "栀子", category: "清热药", property: "苦,寒", meridian: "心、肺、三焦", functions: "泻火除烦,清热利湿,凉血解毒", indications: "热病心烦,湿热黄疸,血热吐衄", level: "一类", mnemonic: "栀子泻火除烦", mnemonicExplanation: "栀子清三焦之火,尤善清心除烦" },
  // ===== 泻下药 =====
  { id: "h_dahuang", name: "大黄", category: "泻下药", property: "苦,寒", meridian: "脾、胃、大肠、肝、心包", functions: "泻下攻积,清热泻火,凉血解毒,逐瘀通经", indications: "积滞便秘,血热吐衄,瘀血经闭", level: "一类", mnemonic: "大黄攻积逐瘀", mnemonicExplanation: "大黄为泻下攻积要药,生用后下" },
  // ===== 化湿药 =====
  { id: "h_huoxiang", name: "藿香", category: "化湿药", property: "辛,微温", meridian: "脾、胃、肺", functions: "化湿醒脾,解暑发表,和中止呕", indications: "湿阻中焦,暑湿感冒,呕吐", level: "一类", mnemonic: "藿香化湿止呕", mnemonicExplanation: "藿香芳香化湿,为暑湿要药" },
  // ===== 利水渗湿药 =====
  { id: "h_fuling", name: "茯苓", category: "利水渗湿药", property: "甘、淡,平", meridian: "心、肺、脾、肾", functions: "利水渗湿,健脾,宁心", indications: "水肿尿少,痰饮眩悸,脾虚食少,心神不安", level: "一类", mnemonic: "茯苓利水健脾", mnemonicExplanation: "茯苓甘淡利水,兼健脾宁心" },
  // ===== 温里药 =====
  { id: "h_fuzi", name: "附子", category: "温里药", property: "辛、甘,大热,有毒", meridian: "心、肾、脾", functions: "回阳救逆,补火助阳,散寒止痛", indications: "亡阳虚脱,肢冷脉微,阳痿宫冷", level: "一类", mnemonic: "附子回阳救逆", mnemonicExplanation: "附子大热,为回阳救逆第一要药(有毒,先煎)" },
  { id: "h_ganjiang", name: "干姜", category: "温里药", property: "辛,热", meridian: "脾、胃、肾、心、肺", functions: "温中散寒,回阳通脉,温肺化饮", indications: "脘腹冷痛,亡阳证,寒饮喘咳", level: "一类", mnemonic: "干姜温中化饮", mnemonicExplanation: "干姜温中散寒,为温中主药" },
  // ===== 理气药 =====
  { id: "h_chenpi", name: "陈皮", category: "理气药", property: "辛、苦,温", meridian: "脾、肺", functions: "理气健脾,燥湿化痰", indications: "脘腹胀满,食少吐泻,咳嗽痰多", level: "一类", mnemonic: "陈皮理气化痰", mnemonicExplanation: "陈皮理气燥湿,为治痰要药" },
  // ===== 止血药 =====
  { id: "h_sanqi", name: "三七", category: "止血药", property: "甘、微苦,温", meridian: "肝、胃", functions: "散瘀止血,消肿定痛", indications: "咯血吐血,跌打损伤,瘀血肿痛", level: "一类", mnemonic: "三七化瘀止血", mnemonicExplanation: "三七止血不留瘀,化瘀不伤正" },
  // ===== 活血化瘀药 =====
  { id: "h_chuanxiong", name: "川芎", category: "活血化瘀药", property: "辛,温", meridian: "肝、胆、心包", functions: "活血行气,祛风止痛", indications: "血瘀气滞痛证,头痛,风湿痹痛", level: "一类", mnemonic: "川芎行气活血", mnemonicExplanation: "川芎为血中气药,善治头痛" },
  { id: "h_danggui", name: "当归", category: "补虚药", property: "甘、辛,温", meridian: "肝、心、脾", functions: "补血活血,调经止痛,润肠通便", indications: "血虚萎黄,月经不调,虚寒腹痛,肠燥便秘", level: "一类", mnemonic: "当归补血调经", mnemonicExplanation: "当归为补血要药,兼活血止痛" },
  // ===== 化痰止咳平喘药 =====
  { id: "h_banxia", name: "半夏", category: "化痰止咳平喘药", property: "辛,温,有毒", meridian: "脾、胃、肺", functions: "燥湿化痰,降逆止呕,消痞散结", indications: "湿痰寒痰,呕吐,心下痞,梅核气", level: "一类", mnemonic: "半夏燥湿止呕", mnemonicExplanation: "半夏为燥湿化痰要药(有毒,姜制)" },
  { id: "h_kuandonghua", name: "款冬花", category: "化痰止咳平喘药", property: "辛、微苦,温", meridian: "肺", functions: "润肺下气,止咳化痰", indications: "新久咳嗽,喘咳痰多,劳嗽咳血", level: "二类", mnemonic: "款冬止咳", mnemonicExplanation: "款冬花为治咳要药,无论寒热虚实皆可配用" },
  // ===== 安神药 =====
  { id: "h_suanzaoren", name: "酸枣仁", category: "安神药", property: "甘、酸,平", meridian: "心、肝、胆", functions: "养心补肝,宁心安神,敛汗,生津", indications: "虚烦不眠,惊悸多梦,体虚多汗", level: "一类", mnemonic: "枣仁养心安神", mnemonicExplanation: "酸枣仁为养心安神要药" },
  // ===== 平肝息风药 =====
  { id: "h_gouteng", name: "钩藤", category: "平肝息风药", property: "甘,凉", meridian: "肝、心包", functions: "清热平肝,息风定惊", indications: "肝阳上亢,头晕目眩,惊痫抽搐", level: "一类", mnemonic: "钩藤平肝息风", mnemonicExplanation: "钩藤清热息风,后下" },
  // ===== 补虚药 =====
  { id: "h_renshen", name: "人参", category: "补虚药", property: "甘、微苦,微温", meridian: "脾、肺、心、肾", functions: "大补元气,复脉固脱,补脾益肺,生津养血,安神益智", indications: "体虚欲脱,肢冷脉微,脾虚食少,肺虚喘咳", level: "一类", mnemonic: "人参大补元气", mnemonicExplanation: "人参为大补元气之要药" },
  { id: "h_huangqi", name: "黄芪", category: "补虚药", property: "甘,微温", meridian: "脾、肺", functions: "补气升阳,固表止汗,利水消肿,托毒生肌", indications: "气虚乏力,中气下陷,自汗,水肿,疮疡难溃", level: "一类", mnemonic: "黄芪补气升阳", mnemonicExplanation: "黄芪为补气要药,善升阳固表" },
  { id: "h_gancao", name: "甘草", category: "补虚药", property: "甘,平", meridian: "心、肺、脾、胃", functions: "补脾益气,清热解毒,祛痰止咳,缓急止痛,调和诸药", indications: "脾胃虚弱,咳嗽痰多,脘腹挛急疼痛,药食中毒", level: "一类", mnemonic: "甘草调和诸药", mnemonicExplanation: "甘草为调和诸药之使药(生用泻火,炙用补中)" },
  // ===== 收涩药 =====
  { id: "h_shanzhuyu", name: "山茱萸", category: "收涩药", property: "酸、涩,微温", meridian: "肝、肾", functions: "补益肝肾,收涩固脱", indications: "眩晕耳鸣,腰膝酸痛,阳痿遗精,大汗虚脱", level: "一类", mnemonic: "茱萸补肝涩脱", mnemonicExplanation: "山茱萸既补肝肾又敛汗固脱" },
];

function main() {
  const entries: HerbEntry[] = HERBS.map((h) => {
    const categoryId = CATEGORY_ID[h.category];
    if (!categoryId) throw new Error(`未知分类: ${h.category}`);
    return {
      id: h.id,
      name: h.name,
      category: h.category,
      property: h.property,
      meridian: h.meridian,
      functions: h.functions,
      indications: h.indications,
      level: h.level,
    };
  });

  const result = validateHerbSet(entries);
  console.log("中药种子数据校验结果:");
  console.log(JSON.stringify(result, null, 2));
  if (result.invalid > 0) {
    console.error("❌ 存在不完整条目:", result.invalidIds);
    process.exit(1);
  }
  console.log(`✅ ${result.total} 味中药种子数据全部通过完整性校验`);
  // 输出可入库的 JSON(Phase 1 部署时使用)
  console.log("---DATA---");
  console.log(JSON.stringify(entries, null, 2));
}

main();
