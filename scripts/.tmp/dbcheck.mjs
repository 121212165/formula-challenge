import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const [fc, f, u] = await Promise.all([
    p.formulaCategory.count(),
    p.formula.count(),
    p.user.count(),
  ]);
  console.log(JSON.stringify({ categories: fc, formulas: f, users: u }));
} catch (e) {
  console.log("DB_ERR:", String(e.message || e).slice(0, 200));
} finally { await p.$disconnect(); }
