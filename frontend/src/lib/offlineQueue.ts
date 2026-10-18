import { get, set } from "idb-keyval";

/**
 * Hàng đợi thao tác ghi khi mất mạng (sửa tồn, tick giỏ, đánh dấu voucher).
 * - Mỗi thao tác mang idempotency_key sinh lúc người dùng bấm, nên gửi lại bao nhiêu lần
 *   backend cũng chỉ ghi một lần.
 * - iOS Safari không có Background Sync, nên hàng đợi được xả khi app mở lại
 *   và khi trình duyệt báo có mạng ("online").
 * - Lưu hóa đơn KHÔNG đi qua hàng đợi này: người dùng phải thấy kết quả lưu ngay.
 */
export type QueuedWrite = {
  key: string;            // idempotency key
  method: "PATCH" | "POST" | "PUT" | "DELETE";
  path: string;           // ví dụ /items/sua-tuoi
  body?: unknown;
  queuedAt: number;
};

const STORE_KEY = "mimi.writeQueue.v1";

export async function enqueue(w: Omit<QueuedWrite, "queuedAt">) {
  const q = ((await get(STORE_KEY)) as QueuedWrite[] | undefined) ?? [];
  if (q.some((x) => x.key === w.key)) return;
  q.push({ ...w, queuedAt: Date.now() });
  await set(STORE_KEY, q);
}

export async function pendingCount(): Promise<number> {
  return (((await get(STORE_KEY)) as QueuedWrite[] | undefined) ?? []).length;
}

let flushing = false;

/** Gửi lần lượt theo thứ tự. Dừng ở lỗi mạng đầu tiên; bỏ thao tác bị backend từ chối hẳn (4xx). */
export async function flush(send: (w: QueuedWrite) => Promise<Response>) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let q = ((await get(STORE_KEY)) as QueuedWrite[] | undefined) ?? [];
    while (q.length) {
      const [head, ...rest] = q;
      let res: Response;
      try {
        res = await send(head);
      } catch {
        break; // vẫn mất mạng
      }
      if (res.status >= 500) break;
      q = rest;
      await set(STORE_KEY, q);
    }
  } finally {
    flushing = false;
  }
}

export async function clearQueue() {
  await set(STORE_KEY, []);
}
