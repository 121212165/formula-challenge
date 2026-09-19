/**
 * node:http 真实服务器适配器 —— 把框架无关的 ApiRouter 接到 node 原生 HTTP。
 *
 * 职责仅做双向协议转换：
 *   IncomingMessage + 流 body  →  Web `Request`  →  router.dispatch  →  Web `Response`  →  ServerResponse。
 * 业务零侵入：所有路由/错误映射仍在 router 与 http-errors 内。
 *
 *   createServer(router)         → 原生 http.Server
 *   startServer(port, container) → 监听（默认 0=随机端口）并返回 { server, url } 供冒烟测试关闭。
 */
import { createServer as createNodeServer } from "node:http";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { ApiRouter } from "./router";
import { toErrorResponse } from "./http-errors";
import { buildRouter, type Container, createContainer } from "./index";

/** 把 node 请求体读成 Buffer。 */
async function readReqBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** 用给定 router 构造一个 node:http 服务器。 */
export function createServer(router: ApiRouter): Server {
  return createNodeServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);

      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }

      const method = (req.method ?? "GET").toUpperCase();
      const hasBody = method !== "GET" && method !== "HEAD";
      const body = hasBody ? await readReqBody(req) : undefined;

      const bodyBuf = body
        ? (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer)
        : undefined;
      const webReq = new Request(url.toString(), {
        method,
        headers,
        body: bodyBuf,
      });
      const webRes = await router.dispatch(webReq);

      res.statusCode = webRes.status;
      webRes.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await webRes.arrayBuffer()));
    } catch (err) {
      // 双保险：dispatch 本就不 reject，这里兜底任何协议层异常。
      const fallback = toErrorResponse(err);
      res.statusCode = fallback.status;
      fallback.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await fallback.arrayBuffer()));
    }
  });
}

export interface RunningServer {
  server: Server;
  /** 形如 http://127.0.0.1:<port> */
  url: string;
}

/**
 * 启动服务器。port 默认 0（操作系统分配随机端口，适合冒烟测试）。
 * container 缺省时用生产容器；测试可传入 getTestPrisma() 装配的容器以共用 SQLite。
 */
export async function startServer(
  port = 0,
  container?: Container
): Promise<RunningServer> {
  const router = buildRouter(container ?? createContainer());
  const server = createServer(router);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${addr.port}` };
}
