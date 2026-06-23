import { db } from "../src/lib/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface MissingFormula {
  name: string;
  chapter: number;
  chapter_name: string;
  composition: string;
  function: string;
  indication: string;
  song: string;
  level: string;
}

function makeId(chapter: number, name: string): string {
  return `c${String(chapter).padStart(2, "0")}_${name}`;
}

async function main() {
  console.log("🌱 添加缺失方剂...");

  const dataPath = resolve(process.cwd(), "data/formulas_missing.json");
  const formulas: MissingFormula[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`  → 读取到 ${formulas.length} 首缺失方剂`);

  let imported = 0;
  let skipped = 0;

  for (const f of formulas) {
    if (!f.chapter || f.chapter === 0) {
      console.log(`  ⚠️ 跳过 ${f.name}（无章节信息）`);
      skipped++;
      continue;
    }

    const id = makeId(f.chapter, f.name);
    
    // Check if already exists
    const existing = await db.formula.findUnique({ where: { id } });
    if (existing) {
      console.log(`  ⚠️ 跳过 ${f.name}（已存在）`);
      skipped++;
      continue;
    }

    const data = {
      id,
      name: f.name,
      source: "",
      alias: JSON.stringify([]),
      categoryId: f.chapter,
      mnemonic: "",
      mnemonicExplanation: f.function || "",
      traditionalMnemonic: f.song || "",
      traditionalMnemonicExplanation: "",
      ingredients: f.composition ? JSON.stringify([f.composition]) : JSON.stringify([]),
      functions: f.function || "",
      indications: f.indication || "",
      trigger: "",
      level: f.level || "三类方",
      sortOrder: 1000 + imported,
    };

    try {
      await db.formula.create({ data });
      imported++;
      console.log(`  ✅ 添加: ${f.name} (${f.level})`);
    } catch (e: any) {
      console.log(`  ❌ 失败: ${f.name} - ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n  ✅ 添加完成: ${imported} 首，跳过 ${skipped} 首`);
  
  // Show final stats
  const total = await db.formula.count();
  const cat1 = await db.formula.count({ where: { level: "一类方" } });
  const cat2 = await db.formula.count({ where: { level: "二类方" } });
  const cat3 = await db.formula.count({ where: { level: "三类方" } });
  console.log(`  📊 总计: ${total} 首（一类方 ${cat1}，二类方 ${cat2}，三类方 ${cat3}）`);
}

main()
  .then(() => {
    console.log("🎉 完成");
    process.exit(0);
  })
  .catch((e) => {
    console.error("💥 失败:", e);
    process.exit(1);
  });
