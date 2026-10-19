import { uiLang } from "../i18n";
/**
 * Backend giả cho chế độ VITE_API_MODE=mock. Dữ liệu mẫu, không phải dữ liệu thật.
 * Quy tắc trạng thái ở đây chỉ mô phỏng; bản thật do API Go tính (internal/domain).
 */
import type {
  Cart, HomeSummary, Item, Me, Notification, PlanPrices, PlanState, PlanStop, ReceiptDraft, SpendingReport, StockStatus,
} from "./types";

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
let mockSettings: Me["settings"] & { display_name?: string } = {
  lead_days: 7, lang: "vi", timezone: "Asia/Ho_Chi_Minh", remind_enabled: true, digest_time: "08:00",
};
/** Bản trước lần sửa tồn gần nhất của từng món, để Hoàn tác trả lại đúng trạng thái cũ. */
const beforeOverride = new Map<string, Item>();
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

// ================= Kế hoạch (bản thử) =================
// Giá mỗi đơn vị từng trả ở mỗi cửa hàng: dữ liệu mẫu, không phải giá thật.
const MOCK_PRICES: Record<string, Record<string, number>> = {
  "sua-tuoi": { "Co.opmart": 32_000, "Bách Hóa Xanh": 30_000 },
  "nuoc-rua-chen": { "Co.opmart": 38_000, "Bách Hóa Xanh": 41_000 },
  "trung-ga": { "Bách Hóa Xanh": 36_000, "Co.opmart": 38_000 },
  gao: { "Co.opmart": 120_000, "Bách Hóa Xanh": 140_000 },
  "dau-goi": { "Co.opmart": 95_000 },
  "giay-ve-sinh": { "Co.opmart": 78_000, "Bách Hóa Xanh": 72_000 },
  "bot-giat": { "Bách Hóa Xanh": 155_000, "Co.opmart": 189_000 },
};
const cart = new Set<string>(["sua-tuoi", "nuoc-rua-chen", "trung-ga"]);
let planState: PlanState = { buy_date: "", buy_hour: null, trip_note: "" };

/** Cùng quy tắc với domain.PlanShopping: tách nơi khi tiết kiệm từ 10.000đ. */
function mockPrices(): PlanPrices {
  const keys = [...cart];
  const priced = keys.filter((k) => MOCK_PRICES[k]);
  const missing_price = keys.filter((k) => !MOCK_PRICES[k]);
  const single_source = priced.filter((k) => Object.keys(MOCK_PRICES[k]).length === 1);
  const stops = new Map<string, PlanStop>();
  for (const k of priced) {
    const [store, price] = Object.entries(MOCK_PRICES[k]).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    const st = stops.get(store) ?? { store, groups: [], total: 0 };
    st.groups.push(k);
    st.total += price;
    stops.set(store, st);
  }
  const split = [...stops.values()].sort((a, b) => b.groups.length - a.groups.length || a.store.localeCompare(b.store));
  const split_total = split.reduce((a, s) => a + s.total, 0);
  let single_store: PlanStop | null = null;
  const stores = new Set(priced.flatMap((k) => Object.keys(MOCK_PRICES[k])));
  for (const store of stores) {
    if (!priced.every((k) => MOCK_PRICES[k][store] != null)) continue;
    const total = priced.reduce((a, k) => a + MOCK_PRICES[k][store], 0);
    if (!single_store || total < single_store.total) single_store = { store, groups: priced, total };
  }
  const saving = single_store ? single_store.total - split_total : 0;
  const recommend = !priced.length ? "single" : !single_store || (saving >= 10_000 && split.length > 1) ? "split" : "single";
  return { single_store, split, split_total, saving, recommend, missing_price, single_source };
}

function mockCart(): Cart {
  const pr = mockPrices();
  const lines = [...cart].map((k) => items.find((i) => i.key === k)).filter((i): i is Item => !!i);
  const estimate = !lines.some((i) => MOCK_PRICES[i.key])
    ? null
    : pr.recommend === "single" && pr.single_store
      ? pr.single_store.total
      : pr.split_total;
  return {
    items: lines.map((i) => {
      const best = MOCK_PRICES[i.key] && Object.entries(MOCK_PRICES[i.key]).sort((a, b) => a[1] - b[1])[0];
      return {
        key: i.key, name: i.name, category_key: i.category_key, status: i.status, days_left: i.days_left,
        unit_price: best ? best[1] : null, ...(best ? { best_store: best[0] } : {}),
      };
    }),
    item_count: lines.length,
    estimate,
    missing_price: pr.missing_price.length,
    state: planState,
  };
}

export async function mockFetch(path: string, init: RequestInit): Promise<Response> {
  await delay();
  const url = new URL(path, "http://mock");
  const method = (init.method ?? "GET").toUpperCase();
  const p = url.pathname;

  if (method === "GET" && p === "/me") {
    const me: Me = {
      uid: "mock-uid",
      display_name: mockSettings.display_name ?? (localStorage.getItem("mimi.pendingDisplayName") || "Lan"),
      role: "owner",
      receipt_count: receiptCount,
      settings: { lead_days: mockSettings.lead_days, lang: mockSettings.lang, timezone: mockSettings.timezone,
        remind_enabled: mockSettings.remind_enabled, digest_time: mockSettings.digest_time },
    };
    return json(me);
  }

  if (method === "GET" && p === "/home") {
    const summary: HomeSummary = {
      spent_this_month: 1_284_000,
      needs_count: items.filter((i) => isSoon(i, 7)).length,
      plan: (({ item_count, estimate, missing_price }) => ({ item_count, estimate, missing_price }))(mockCart()),
      unread_notifications: 2,
    };
    return json(summary);
  }

  if (method === "GET" && p === "/items") {
    const tab = url.searchParams.get("tab") ?? "soon";
    const horizon = Number(url.searchParams.get("horizon") ?? 7);
    const list = tab === "soon" ? items.filter((i) => isSoon(i, horizon)) : items;
    return json({ items: [...list].sort(order) }); // cùng dạng với API thật
  }

  // Cùng các đường dẫn với API thật: GET /items/{key}, PATCH /items/{key}/stock, DELETE /items/{key}/override.
  const itemMatch = p.match(/^\/items\/([^/]+)(\/stock|\/override)?$/);
  if (itemMatch) {
    const key = decodeURIComponent(itemMatch[1]);
    const sub = itemMatch[2] ?? "";
    const it = items.find((i) => i.key === key);
    if (!it) return json({ code: "not_found", message: L ? "Item not found." : "Không tìm thấy món này." }, 404);
    if (method === "GET" && sub === "") {
      const history = Array.from({ length: Math.min(it.purchase_count, 3) }, (_, n) => ({
        on: iso(new Date(today.getTime() - (n + 1) * 12 * 86_400_000)),
        store: "Co.opmart",
        amount_vnd: 32_000,
      }));
      return json({ ...it, history });
    }
    if (method === "PATCH" && sub === "/stock") {
      const body = JSON.parse(String(init.body ?? "{}")) as { quick?: "plenty" | "soon" | "out" };
      if (!beforeOverride.has(key)) beforeOverride.set(key, it);
      const days = body.quick === "plenty" ? 30 : body.quick === "soon" ? 3 : 0;
      items = items.map((x) =>
        x.key === key
          ? { ...x, days_left: days, source: "manual", status: body.quick === "out" ? "out" : statusFor(days, 9) }
          : x,
      );
      return json(items.find((x) => x.key === key));
    }
    if (method === "DELETE" && sub === "/override") {
      const prev = beforeOverride.get(key);
      if (prev) {
        items = items.map((x) => (x.key === key ? prev : x));
        beforeOverride.delete(key);
      }
      return json(items.find((x) => x.key === key));
    }
  }

  if (method === "POST" && p === "/receipts/read") {
    await delay(1400);
    const form = init.body as FormData;
    // Cùng dạng với Draft của API thật (api/openapi.yaml).
    const line = (line_id: string, en: string, vi: string, qty: number, vnd: number, category_key?: string) => ({
      line_id, name: L ? en : vi, qty, amount: String(vnd), amount_vnd: vnd, habit: true,
      ...(category_key ? { category_key } : {}),
    });
    const lines = [
      line("l1", "Unsweetened fresh milk 1L", "Sữa tươi không đường 1L", 2, 64_000, "sua"),
      line("l2", "Dish soap 750ml", "Nước rửa chén 750ml", 1, 38_000, "hoa-pham"),
      line("l3", "Eggs, box of 10", "Trứng gà hộp 10", 1, 36_000, "tuoi-song"),
      line("l4", "Butter cookies", "Bánh quy bơ", 1, 74_000),
    ];
    const draft: ReceiptDraft = {
      receipt_id: String(form.get("receipt_id")),
      store: "Co.opmart Lý Thường Kiệt",
      purchased_on: iso(today),
      currency: "VND",
      total_printed: "212000",
      lines,
      sum_vnd: lines.reduce((a, l) => a + l.amount_vnd, 0),
      total_mismatch: false,
      fx_missing: false,
      pages: form.getAll("images").length || 1,
      unreadable_pages: 0,
    };
    return json(draft);
  }

  if (method === "POST" && p === "/receipts") {
    // Như backend: từ chối trường lạ (DisallowUnknownFields), để bản thử bắt được lỗi lệch hợp đồng.
    const body = JSON.parse(String(init.body)) as Record<string, unknown> & { receipt_id: string; lines?: Record<string, unknown>[] };
    const top = ["receipt_id", "store", "purchased_on", "currency", "discount_total", "lines", "use_for_prediction", "confirm_duplicate"];
    const lineKeys = ["line_id", "name", "qty", "amount", "category_key", "group_key", "habit"];
    const unknown =
      Object.keys(body).some((k) => !top.includes(k)) ||
      (body.lines ?? []).some((l) => Object.keys(l).some((k) => !lineKeys.includes(k)));
    if (unknown) return json({ code: "bad_request", message: "Unknown field" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.purchased_on ?? ""))) {
      return json({ code: "validation_failed", message: "purchased_on", fields: { field: "purchased_on" } }, 422);
    }
    const replayed = savedReceipts.has(body.receipt_id);
    if (!replayed) {
      savedReceipts.add(body.receipt_id);
      receiptCount += 1;
    }
    return json({ receipt_id: body.receipt_id, status: "saved", replayed }, replayed ? 200 : 201);
  }

  if (method === "PUT" && p === "/settings") {
    const body = JSON.parse(String(init.body ?? "{}")) as Partial<typeof mockSettings>;
    mockSettings = { ...mockSettings, ...body };
    return json({ ...mockSettings, display_name: mockSettings.display_name ?? "Lan" });
  }

  if (method === "GET" && p === "/spending") {
    const month = url.searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) return json({ code: "validation_failed", message: "month" }, 422);
    const [y, m] = month.split("-").map(Number);
    const sameAsMock = y === today.getFullYear() && m === today.getMonth() + 1;
    const prevOfMock = (y * 12 + m) === today.getFullYear() * 12 + today.getMonth(); // tháng liền trước
    const base: SpendingReport = {
      month, spent: 0, spent_prev_month_pct: null, saved: 0, saved_ratio: null, receipt_count: 0,
      by_category: [], top_saving_receipts: [], recent_receipts: [],
    };
    if (prevOfMock) return json({ ...base, spent: 1_070_000, receipt_count: 4 });
    if (!sameAsMock) return json(base);
    const r = (id: string, store: string, d: number, total: number, discount: number) => ({
      receipt_id: id, store, purchased_on: `${month}-${String(d).padStart(2, "0")}`, total_vnd: total, discount_vnd: discount,
    });
    return json({
      ...base, spent: 1_284_000, spent_prev_month_pct: 20, saved: 96_000, saved_ratio: 0.07, receipt_count: receiptCount,
      by_category: [
        { key: "hoa-pham", amount: 412_000, pct: 32.1 }, { key: "sua", amount: 318_000, pct: 24.8 },
        { key: "tuoi-song", amount: 264_000, pct: 20.6 }, { key: "do-kho", amount: 190_000, pct: 14.8 },
        { key: "chua-phan-loai", amount: 100_000, pct: 7.8 },
      ],
      top_saving_receipts: [r("r2", "Co.opmart Lý Thường Kiệt", 12, 486_000, 54_000), r("r1", "Bách Hóa Xanh", 4, 312_000, 42_000)],
      recent_receipts: [r("r3", "Bách Hóa Xanh", 15, 274_000, 0), r("r2", "Co.opmart Lý Thường Kiệt", 12, 486_000, 54_000), r("r1", "Bách Hóa Xanh", 4, 312_000, 42_000)],
    } satisfies SpendingReport);
  }

  if (method === "GET" && p === "/notifications") {
    const list: Notification[] = items
      .filter((i) => isSoon(i, 7))
      .sort(order)
      .map((i) => ({ id: `item:${i.key}`, kind: "item", item_key: i.key, name: i.name, status: i.status, days_left: i.days_left }));
    return json({ items: list });
  }

  if (method === "GET" && p === "/plan") return json(mockCart());
  if (method === "GET" && p === "/plan/prices") return json(mockPrices());
  if (method === "PUT" && p === "/plan/state") {
    planState = JSON.parse(String(init.body)) as PlanState;
    return json(planState);
  }
  const planItem = p.match(/^\/plan\/items\/([^/]+)$/);
  if (planItem) {
    const key = decodeURIComponent(planItem[1]);
    if (method === "PUT") {
      if (!items.some((i) => i.key === key)) return json({ code: "not_found", message: "Not found" }, 404);
      cart.add(key);
      return json(mockCart());
    }
    if (method === "DELETE") {
      cart.delete(key);
      return json(undefined, 204);
    }
  }

  return json({ code: "not_found", message: `Prototype: ${method} ${p} is not available` }, 404);
}
