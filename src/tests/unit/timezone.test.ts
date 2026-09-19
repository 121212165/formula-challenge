/**
 * createGetLocalDate 生产实现单元测试（P2-10 / BR-061）。
 *
 * 用 mock UserRepository 返回不同时区，验证 IANA 时区到 "YYYY-MM-DD" 的换算。
 */
import { describe, it, expect, vi } from "vitest";
import { createGetLocalDate } from "@/shared/infrastructure/timezone";

/** 构造一个按 userId 返回不同时区的 mock 仓库 */
function mockUsers(byId: Record<string, { timezone: string } | null>) {
  return {
    findById: vi.fn(async (id: string) => byId[id] ?? null),
  };
}

describe("createGetLocalDate —— IANA 时区到本地日期（YYYY-MM-DD）", () => {
  const MOMENT = new Date("2026-09-18T01:30:00.000Z"); // 北京时间 09:30 / 洛杉矶前一日 18:30

  it("Asia/Shanghai（UTC+8）：01:30Z → 本地 09:30，同日 2026-09-18", async () => {
    const getLocalDate = createGetLocalDate({
      users: mockUsers({ "u-cn": { timezone: "Asia/Shanghai" } }),
    });
    expect(await getLocalDate("u-cn", MOMENT)).toBe("2026-09-18");
  });

  it("America/Los_Angeles（9 月 PDT=UTC-7）：01:30Z → 本地前一日 18:30，2026-09-17", async () => {
    const getLocalDate = createGetLocalDate({
      users: mockUsers({ "u-la": { timezone: "America/Los_Angeles" } }),
    });
    expect(await getLocalDate("u-la", MOMENT)).toBe("2026-09-17");
  });

  it("UTC 时区：01:30Z 仍为 2026-09-18", async () => {
    const getLocalDate = createGetLocalDate({
      users: mockUsers({ "u-utc": { timezone: "UTC" } }),
    });
    expect(await getLocalDate("u-utc", MOMENT)).toBe("2026-09-18");
  });

  it("用户不存在时回退 UTC（不抛错）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getLocalDate = createGetLocalDate({ users: mockUsers({}) });
    expect(await getLocalDate("ghost", MOMENT)).toBe("2026-09-18");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("用户时区非法时回退 UTC（不抛错）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getLocalDate = createGetLocalDate({
      users: mockUsers({ "u-bad": { timezone: "Not/AZone" } }),
    });
    expect(await getLocalDate("u-bad", MOMENT)).toBe("2026-09-18");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("跨日边界：UTC 正午在 Pacific/Kiritimati（UTC+14）已是次日", async () => {
    const getLocalDate = createGetLocalDate({
      users: mockUsers({ "u-kirit": { timezone: "Pacific/Kiritimati" } }),
    });
    // 2026-09-18T12:00:00Z → UTC+14 = 2026-09-19T02:00
    expect(await getLocalDate("u-kirit", new Date("2026-09-18T12:00:00.000Z"))).toBe("2026-09-19");
  });
});
