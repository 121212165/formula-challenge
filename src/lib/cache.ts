// 纯数据响应缓存头(ISR 配套,2026-08)
// 种子/众包合入的数据低频变更:CDN 缓存 1h,过期后允许 stale 回源(最长 1 天)
// 审核合入/种子入库时通过 revalidatePath 主动失效,无需等 TTL
export const DATA_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};
