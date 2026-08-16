// POST /api/revalidate 测试(ISR 手动失效端点)
import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { POST } from "@/app/api/revalidate/route";

beforeEach(() => {
  revalidatePathMock.mockClear();
  delete process.env.CRON_SECRET;
});

describe("POST /api/revalidate", () => {
  it("未配置 CRON_SECRET → 500", async () => {
    const res = await POST(new Request("http://x/api/revalidate", { method: "POST", body: "{}" }));
    expect(res.status).toBe(500);
  });

  it("secret 错误 → 401", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(new Request("http://x/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths: ["/herbs"] }),
    }));
    expect(res.status).toBe(401);
  });

  it("Bearer 鉴权通过 → revalidate 白名单路径", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(new Request("http://x/api/revalidate", {
      method: "POST",
      headers: { authorization: "Bearer s3cret", "content-type": "application/json" },
      body: JSON.stringify({ paths: ["/herbs", "/api/herbs", "/acupoints"] }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.revalidated).toBe(3);
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
  });

  it("?secret= 查询参数鉴权也通过", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(new Request("http://x/api/revalidate?secret=s3cret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths: ["/categories"] }),
    }));
    expect(res.status).toBe(200);
  });

  it("非法路径被拒绝(防任意路径探测)", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(new Request("http://x/api/revalidate", {
      method: "POST",
      headers: { authorization: "Bearer s3cret", "content-type": "application/json" },
      body: JSON.stringify({ paths: ["/api/ai/conversation"] }),
    }));
    expect(res.status).toBe(400);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("body 非 JSON → 400", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await POST(new Request("http://x/api/revalidate", {
      method: "POST",
      headers: { authorization: "Bearer s3cret", "content-type": "application/json" },
      body: "not-json",
    }));
    expect(res.status).toBe(400);
  });
});
