import { uiLang } from "../i18n";

/**
 * Chuẩn hóa để tìm không dấu: "Dầu gội" và "dau goi" khớp nhau.
 * NFD tách dấu thanh và dấu mũ nhưng KHÔNG tách "đ" (U+0111), nên phải map riêng.
 * Vẫn cần ở giao diện tiếng Anh vì tên món trên hóa đơn Việt Nam có dấu.
 */
export function normalizeVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// Tiền đã được backend tính bằng số nguyên đồng; client chỉ định dạng, không tính.
const vndEn = new Intl.NumberFormat("en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const vndVi = new Intl.NumberFormat("vi-VN");

/** en: "₫1,284,000" · vi: "1.284.000đ" */
export function formatVnd(amount: number): string {
  return uiLang === "en" ? vndEn.format(amount) : `${vndVi.format(amount)}đ`;
}

const dayMonthEn = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** YYYY-MM-DD → en: "Oct 15" · vi: "15/10" */
export function formatDayMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (uiLang === "en") return dayMonthEn.format(new Date(Date.UTC(y, m - 1, d)));
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
