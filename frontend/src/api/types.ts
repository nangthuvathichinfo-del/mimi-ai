/**
 * Kiểu dữ liệu tạm viết tay theo spec. Khi có api/openapi.yaml, chạy `npm run gen:api`
 * để sinh src/api/schema.d.ts và thay file này bằng các kiểu sinh ra.
 * Mọi con số tiền và số ngày đều do backend tính; client chỉ hiển thị.
 */
export type Role = "owner" | "member" | "solo";

export type Me = {
  uid: string;
  display_name: string | null;
  role: Role;
  receipt_count: number;
  settings: { lead_days: number; lang: "vi" | "en"; timezone: string };
};

export type HomeSummary = {
  spent_this_month: number | null;   // null khi tháng chưa có hóa đơn
  needs_count: number;               // đếm theo đúng quy tắc Cần mua
  plan: { item_count: number; estimate: number | null; missing_price: number };
  unread_notifications: number;
};

/** Nhãn trạng thái dùng chung mọi màn (spec 6.2), theo thứ tự ưu tiên. */
export type StockStatus = "out" | "buy_now" | "soon" | "upcoming" | "plenty" | "waiting";

export type Item = {
  key: string;                 // consumption_group_key
  name: string;
  category_key: string;
  category_label: string;
  status: StockStatus;
  days_left: number | null;    // null: chưa đủ dữ liệu
  purchase_count: number;
  confidence: "low" | "mid" | "high" | null;
  source: "predicted" | "manual";
  predicted_out_on: string | null; // YYYY-MM-DD
};

export type ItemsQuery = {
  tab: "soon" | "active";
  horizon: 3 | 7 | 14;
};

/** Còn nhiều = 30 ngày, Sắp hết = 3 ngày, Đã hết = 0 (spec mục 4). */
export type QuickStock = "plenty" | "soon" | "out";

export type ReceiptDraftLine = {
  line_id: string;
  name: string;
  qty: number;
  line_total: number;
  category_key: string | null;   // null: hiện nút "Chọn nhóm"
  habit: boolean;
};

export type ReceiptDraft = {
  receipt_id: string;
  store: string | null;
  purchased_on: string | null;
  currency: string;
  total_printed: number | null;
  lines: ReceiptDraftLine[];
  duplicate_of: string | null;
};

export type ApiErrorBody = { code: string; message: string };
