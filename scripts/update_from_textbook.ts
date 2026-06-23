import { db } from "../src/lib/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface TextbookFormula {
  name: string;
  composition: string;
  function: string;
  indication: string;
  song: string;
}

async function main() {
  console.log("🔄 更新方剂数据...");

  const dataPath = resolve(process.cwd(), "data/formulas_from_textbook.json");
  const textbook: TextbookFormula[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`  → 读取到 ${textbook.length} 首教材方剂`);

  // Create lookup by name
  const textbookMap = new Map<string, TextbookFormula>();
  for (const f of textbook) {
    textbookMap.set(f.name, f);
  }

  // Get all formulas from database
  const dbFormulas = await db.formula.findMany();
  console.log(`  → 数据库中有 ${dbFormulas.length} 首方剂`);

  let updated = 0;
  let skipped = 0;

  for (const dbf of dbFormulas) {
    const td = textbookMap.get(dbf.name);
    if (!td) {
      skipped++;
      continue;
    }

    // Build update data - only update empty fields
    const updateData: any = {};
    let needsUpdate = false;

    if (!dbf.functions && td.function) {
      updateData.functions = td.function;
      needsUpdate = true;
    }
    if (!dbf.indications && td.indication) {
      updateData.indications = td.indication;
      needsUpdate = true;
    }
    if (!dbf.traditionalMnemonic && td.song) {
      updateData.traditionalMnemonic = td.song;
      needsUpdate = true;
    }
    if (dbf.ingredients === '[]' && td.composition) {
      updateData.ingredients = JSON.stringify([td.composition]);
      needsUpdate = true;
    }

    if (needsUpdate) {
      await db.formula.update({
        where: { id: dbf.id },
        data: updateData,
      });
      updated++;
      console.log(`  ✅ 更新: ${dbf.name}`);
    }
  }

  console.log(`\n  ✅ 更新完成: ${updated} 首，跳过 ${skipped} 首`);

  // Show final stats
  const total = await db.formula.count();
  const withFunc = await db.formula.count({ where: { functions: { not: '' } } });
  const withIndic = await db.formula.count({ where: { indications: { not: '' } } });
  const withMnemonic = await db.formula.count({ where: { traditionalMnemonic: { not: '' } } });
  console.log(`  📊 总计: ${total} 首`);
  console.log(`  📊 有功效: ${withFunc} 首`);
  console.log(`  📊 有主治: ${withIndic} 首`);
  console.log(`  📊 有方歌: ${withMnemonic} 首`);
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
