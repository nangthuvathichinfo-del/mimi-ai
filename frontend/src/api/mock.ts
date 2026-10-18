import { uiLang } from "../i18n";
/**
 * Backend giả cho chế độ VITE_API_MODE=mock. Dữ liệu mẫu, không phải dữ liệu thật.
 * Quy tắc trạng thái ở đây chỉ mô phỏng; bản thật do API Go tính (internal/domain).
 */
import type { HomeSummary, Item, Me, ReceiptDraft, StockStatus } from "./types";

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function statusFor(days: number | null, purchases: number, forcedOut = false): StockStatus {
  if (forcedOut) return "out";
  if (days === null || purchases < 3) return "waiting";
  if (days <= 0) return "buy_now";
  if (days <= 7) return "soon";
  if (days <= 14) return "upcoming";
  return "plenty";
}

type Seed = [key: string, name: [vi: string, en: string], cat: string, catLabel: [vi: string, en: string], days: number | null, purchases: number];
const L = uiLang === "vi" ? 0 : 1;
const seeds: Seed[] = [
  ["sua-tuoi", ["Sữa tươi không đường", "Unsweetened fresh milk"], "sua", ["Sữa và đồ uống", "Dairy & drinks"], 0, 6],
  ["nuoc-rua-chen", ["Nước rửa chén", "Dish soap"], "hoa-pham", ["Hóa phẩm gia đình", "Household cleaning"], 0, 4],
  ["trung-ga", ["Trứng gà", "Eggs"], "tuoi-song", ["Thịt, cá, trứng", "Meat, fish & eggs"], 2, 9],
  ["dau-goi", ["Dầu gội", "Shampoo"], "ve-sinh", ["Chăm sóc cá nhân", "Personal care"], 5, 3],
  ["gao", ["Gạo ST25", "ST25 rice"], "do-kho", ["Đồ khô", "Pantry"], 6, 5],
  ["giay-ve-sinh", ["Giấy vệ sinh", "Toilet paper"], "hoa-pham", ["Hóa phẩm gia đình", "Household cleaning"], 11, 4],
  ["bot-giat", ["Bột giặt", "Laundry detergent"], "hoa-pham", ["Hóa phẩm gia đình", "Household cleaning"], 13, 3],
  ["kem-danh-rang", ["Kem đánh răng", "Toothpaste"], "ve-sinh", ["Chăm sóc cá nhân", "Personal care"], 19, 4],
  ["nuoc-mam", ["Nước mắm", "Fish sauce"], "gia-vi", ["Gia vị", "Condiments"], 26, 3],
  ["ca-phe", ["Cà phê hạt", "Coffee beans"], "sua", ["Sữa và đồ uống", "Dairy & drinks"], null, 1],
];
const today = new Date(2026, 9, 16);
const iso = (d: Date) => d.toISOString().slice(0, 10);

let items: Item[] = seeds.map(([key, names, category_key, labels, days, purchase_count]) => ({
  key,
  name: names[L],
  category_key,
  category_label: labels[L],
  days_left: purchase_count < 2 ? null : days,
  purchase_count,
  status: statusFor(days, purchase_count, key === "nuoc-rua-chen"),
  confidence: purchase_count >= 4 ? "high" : purchase_count === 3 ? "mid" : purchase_count === 2 ? "low" : null,
  source: "predicted",
  predicted_out_on: days === null ? null : iso(new Date(today.getTime() + days * 86_400_000)),
}));

let receiptCount = 3;
const savedReceipts = new Set<string>();

function json(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isSoon(i: Item, horizon: number) {
  return i.status === "out" || i.status === "buy_now" || (i.days_left !== null && i.status !== "waiting" && i.days_left <= horizon);
}

const order = (a: Item, b: Item) => (a.days_left ?? 999) - (b.days_left ?? 999);

export async function mockFetch(path: string, init: RequestInit): Promise<Response> {
  await delay();
  const url = new URL(path, "http://mock");
  const method = (init.method ?? "GET").toUpperCase();
  const p = url.pathname;

  if (method === "GET" && p === "/me") {
    const me: Me = {
      uid: "mock-uid",
      display_name: localStorage.getItem("mimi.pendingDisplayName") || "Lan",
      role: "owner",
      receipt_count: receiptCount,
      settings: { lead_days: 7, lang: "vi", timezone: "Asia/Ho_Chi_Minh" },
    };
    return json(me);
  }

  if (method === "GET" && p === "/home") {
    const summary: HomeSummary = {
      spent_this_month: 1_284_000,
      needs_count: items.filter((i) => isSoon(i, 7)).length,
      plan: { item_count: 3, estimate: 186_000, missing_price: 1 },
      unread_notifications: 2,
    };
    return json(summary);
  }

  if (method === "GET" && p === "/items") {
    const tab = url.searchParams.get("tab") ?? "soon";
    const horizon = Number(url.searchParams.get("horizon") ?? 7);
    const list = tab === "soon" ? items.filter((i) => isSoon(i, horizon)) : items;
    return json([...list].sort(order));
  }

  const itemMatch = p.match(/^\/items\/([^/]+)$/);
  if (itemMatch) {
    const it = items.find((i) => i.key === itemMatch[1]);
    if (!it) return json({ code: "not_found", message: L ? "Item not found." : "Không tìm thấy món này." }, 404);
    if (method === "GET") return json(it);
    if (method === "PATCH") {
      const body = JSON.parse(String(init.body ?? "{}")) as { quick?: "plenty" | "soon" | "out"; restore?: Item };
      if (body.restore) {
        items = items.map((x) => (x.key === it.key ? body.restore! : x));
      } else {
        const days = body.quick === "plenty" ? 30 : body.quick === "soon" ? 3 : 0;
        items = items.map((x) =>
          x.key === it.key
            ? { ...x, days_left: days, source: "manual", status: body.quick === "out" ? "out" : statusFor(days, 9) }
            : x,
        );
      }
      return json(items.find((x) => x.key === it.key));
    }
  }

  if (method === "POST" && p === "/receipts/read") {
    await delay(1400);
    const form = init.body as FormData;
    const draft: ReceiptDraft = {
      receipt_id: String(form.get("receipt_id")),
      store: "Co.opmart Lý Thường Kiệt",
      purchased_on: iso(today),
      currency: "VND",
      total_printed: 212_000,
      duplicate_of: null,
      lines: [
        { line_id: "l1", name: L ? "Unsweetened fresh milk 1L" : "Sữa tươi không đường 1L", qty: 2, line_total: 64_000, category_key: "sua", habit: true },
        { line_id: "l2", name: L ? "Dish soap 750ml" : "Nước rửa chén 750ml", qty: 1, line_total: 38_000, category_key: "hoa-pham", habit: true },
        { line_id: "l3", name: L ? "Eggs, box of 10" : "Trứng gà hộp 10", qty: 1, line_total: 36_000, category_key: "tuoi-song", habit: true },
        { line_id: "l4", name: L ? "Butter cookies" : "Bánh quy bơ", qty: 1, line_total: 74_000, category_key: null, habit: true },
      ],
    };
    return json(draft);
  }

  if (method === "POST" && p === "/receipts") {
    const body = JSON.parse(String(init.body)) as { receipt_id: string };
    if (!savedReceipts.has(body.receipt_id)) {
      savedReceipts.add(body.receipt_id);
      receiptCount += 1;
    }
    return json({ receipt_id: body.receipt_id, status: "saved" }, 201);
  }

  if (method === "PUT" && p === "/settings") return json(undefined, 204);

  return json({ code: "not_found", message: `Prototype: ${method} ${p} is not available` }, 404);
}
