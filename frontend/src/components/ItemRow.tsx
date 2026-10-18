import { t } from "../i18n";
import { Link } from "react-router-dom";
import { ChevronRight, Coffee, Droplets, Egg, Package, SprayCan, Wheat, CookingPot, type LucideIcon } from "lucide-react";
import type { Item, StockStatus } from "../api/types";

/** Biểu tượng danh mục (spec: không dùng ảnh sản phẩm, không emoji). */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  sua: Coffee,
  "tuoi-song": Egg,
  "do-kho": Wheat,
  "hoa-pham": SprayCan,
  "ve-sinh": Droplets,
  "gia-vi": CookingPot,
};

/** Nhãn trạng thái dùng chung mọi màn (spec 6.2). Màu luôn đi kèm chữ. */
export const STATUS_TEXT: Record<StockStatus, string> = t.status;

export function statusTone(i: Pick<Item, "status" | "days_left">): string {
  if (i.status === "out" || i.status === "buy_now") return "out";
  if (i.status === "waiting" || i.days_left === null) return "none";
  if (i.days_left <= 7) return "soon";
  if (i.days_left <= 14) return "upcoming";
  return "plenty";
}

export function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICON[category] ?? Package;
  return (
    <span className="row__icon" aria-hidden>
      <Icon size={22} strokeWidth={1.8} />
    </span>
  );
}

/**
 * Dòng mẫu của cả ứng dụng: tên ở trái, con số to ở phải, chữ trạng thái dưới con số.
 * "Mua ngay" thay cho con số khi đã hết hoặc còn 0 ngày; không bao giờ hiện cùng "Đến lúc mua".
 */
export function ItemRow({ item, children }: { item: Item; children?: React.ReactNode }) {
  const tone = statusTone(item);
  const buyNow = tone === "out";
  return (
    <li className="item">
      <Link to={`/items/${item.key}`} className="row">
        <CategoryIcon category={item.category_key} />
        <span className="row__name">{item.name}</span>
        <span className={`row__figure tone-${tone}`}>
          {buyNow ? (
            <span className="row__now">{t.row.buyNow}</span>
          ) : item.days_left === null || item.status === "waiting" ? (
            <span className="row__big num" aria-hidden>–</span>
          ) : (
            <span className="row__big num">{item.days_left}</span>
          )}
          <span className="row__unit">
            {buyNow
              ? item.status === "out"
                ? t.row.outNow
                : t.row.zeroDays
              : item.status === "waiting" || item.days_left === null
                ? t.row.waiting
                : t.row.days(item.days_left, STATUS_TEXT[item.status])}
          </span>
        </span>
        <ChevronRight className="row__chev" size={20} aria-hidden />
      </Link>
      {children}
    </li>
  );
}
