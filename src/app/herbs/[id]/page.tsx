// 中药详情页(server component,Phase 1)
// 展示性味归经/功效/主治/用法/禁忌 + 功效默写闯关(新评分规则 FR-2.5)
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { HerbDetail } from "@/components/herb-detail";
import { validItemId } from "@/lib/subject";

export const revalidate = 3600; // ISR:种子数据低频变更,1h 增量再验证(众包合入时 revalidatePath 主动失效)

// ISR 预渲染全部详情路径
export async function generateStaticParams() {
  const herbs = await db.herb.findMany({ select: { id: true } });
  return herbs.map((h) => ({ id: h.id }));
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HerbDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  if (!validItemId("herb", id)) {
    notFound();
  }

  const herb = await db.herb.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!herb) {
    notFound();
  }

  return (
    <HerbDetail
      herb={{
        id: herb.id,
        name: herb.name,
        source: herb.source,
        property: herb.property,
        meridian: herb.meridian,
        functions: herb.functions,
        indications: herb.indications,
        usage: herb.usage,
        contraindications: herb.contraindications,
        compatibility: herb.compatibility,
        mnemonic: herb.mnemonic,
        mnemonicExplanation: herb.mnemonicExplanation,
        level: herb.level,
        categoryName: herb.category?.name,
      }}
    />
  );
}
