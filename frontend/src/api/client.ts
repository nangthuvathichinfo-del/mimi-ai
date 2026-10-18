import { t } from "../i18n";
import { API_MODE, appCheckToken } from "../lib/firebase";
import { enqueue, flush, type QueuedWrite } from "../lib/offlineQueue";
import { mockFetch } from "./mock";
import type { ApiErrorBody } from "./types";

/**
 * Mọi lời gọi đi qua /api trên cùng tên miền (Firebase Hosting rewrite sang Cloud Run),
 * nên không cần CORS. Mỗi request mang:
 *   Authorization: Bearer <Firebase ID token>
 *   X-Firebase-AppCheck: <token>
 *   Idempotency-Key: <uuid> cho thao tác ghi
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export class OfflineError extends Error {}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: { getToken: TokenGetter; onUnauthorized: () => void }) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

async function headers(extra?: Record<string, string>) {
  const h: Record<string, string> = { Accept: "application/json", ...extra };
  const token = await getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  const ac = await appCheckToken();
  if (ac) h["X-Firebase-AppCheck"] = ac;
  return h;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  if (API_MODE === "mock") return mockFetch(path, init);
  return fetch(`/api${path}`, init);
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, "unauthenticated", t.common.sessionExpired);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.code ?? "unknown", body?.message ?? t.common.genericError);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, { headers: await headers() });
  } catch {
    throw new OfflineError("offline");
  }
  return parse<T>(res);
}

/** Ghi trực tiếp, báo lỗi ngay. Dùng cho lưu hóa đơn, xóa dữ liệu, cài đặt. */
export async function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, {
      method,
      headers: await headers({ "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError("offline");
  }
  return parse<T>(res);
}

/**
 * Ghi có thể xếp hàng khi mất mạng (sửa tồn nhanh, tick giỏ).
 * Trả về "queued" để UI hiện "Sẽ đồng bộ khi có mạng".
 */
export async function apiSendQueued(
  method: QueuedWrite["method"],
  path: string,
  body?: unknown,
): Promise<"sent" | "queued"> {
  const key = crypto.randomUUID();
  try {
    await apiSend(method, path, body, key);
    return "sent";
  } catch (e) {
    if (e instanceof OfflineError) {
      await enqueue({ key, method, path, body });
      return "queued";
    }
    throw e;
  }
}

export async function flushQueue() {
  await flush(async (w) =>
    rawFetch(w.path, {
      method: w.method,
      headers: await headers({ "Content-Type": "application/json", "Idempotency-Key": w.key }),
      body: w.body === undefined ? undefined : JSON.stringify(w.body),
    }),
  );
}

/** Gửi ảnh hóa đơn dạng multipart; ảnh đã được nén ở máy. */
export async function apiUploadReceipt<T>(receiptId: string, images: Blob[], lang: string): Promise<T> {
  const form = new FormData();
  form.append("receipt_id", receiptId);
  form.append("lang", lang);
  images.forEach((b, i) => form.append("images", b, `p${i + 1}.jpg`));
  let res: Response;
  try {
    res = await rawFetch("/receipts/read", { method: "POST", headers: await headers(), body: form });
  } catch {
    throw new OfflineError("offline");
  }
  return parse<T>(res);
}
