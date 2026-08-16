// 腧穴详情页(server component,Phase 2)
// 展示定位/主治/刺灸法/特定穴/禁忌/口诀 + 定位默写闯关(FR-3.5)
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AcupointDetail } from "@/components/acupoint-detail";
import { validItemId } from "@/lib/subject";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AcupointDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  if (!validItemId("acupoint", id)) {
    notFound();
  }

  const acupoint = await db.acupoint.findUnique({
    where: { id },
    include: { meridian: true },
  });

  if (!acupoint) {
    notFound();
  }

  return (
    <AcupointDetail
      acupoint={{
        id: acupoint.id,
        name: acupoint.name,
        pinyin: acupoint.pinyin,
        code: acupoint.code,
        meridianName: acupoint.meridian?.name ?? "",
        location: acupoint.location,
        indications: acupoint.indications,
        method: acupoint.method,
        special: acupoint.special,
        caution: acupoint.caution,
        mnemonic: acupoint.mnemonic,
        mnemonicExplanation: acupoint.mnemonicExplanation,
        level: acupoint.level,
      }}
    />
  );
}
