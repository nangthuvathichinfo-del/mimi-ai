import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, apiSendQueued, apiUploadReceipt } from "./client";
import type { HomeSummary, Item, ItemsQuery, Me, QuickStock, ReceiptDraft } from "./types";

/** Khóa cache gom một chỗ để invalidate đúng phạm vi sau mỗi thao tác ghi. */
export const qk = {
  me: ["me"] as const,
  home: ["home"] as const,
  items: (q?: ItemsQuery) => (q ? (["items", q] as const) : (["items"] as const)),
  item: (key: string) => ["item", key] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => apiGet<Me>("/me") });

export const useHome = () => useQuery({ queryKey: qk.home, queryFn: () => apiGet<HomeSummary>("/home") });

export const useItems = (q: ItemsQuery) =>
  useQuery({
    queryKey: qk.items(q),
    queryFn: () => apiGet<Item[]>(`/items?tab=${q.tab}&horizon=${q.horizon}`),
    placeholderData: (prev) => prev, // đổi chip 3/7/14 không nháy trắng
  });

/**
 * "Vẫn còn" / "Đã hết": cập nhật lạc quan, trả về hàm Hoàn tác.
 * Mimi không tự đổi tồn nếu người dùng chưa bấm (spec mục 4).
 */
export function useQuickStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, quick }: { item: Item; quick: QuickStock }) => {
      const result = await apiSendQueued("PATCH", `/items/${item.key}`, { quick });
      return { result, previous: item };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.items() });
      qc.invalidateQueries({ queryKey: qk.home });
    },
  });
}

export function useUndoStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (previous: Item) => apiSendQueued("PATCH", `/items/${previous.key}`, { restore: previous }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.items() });
      qc.invalidateQueries({ queryKey: qk.home });
    },
  });
}

export function useReadReceipt() {
  return useMutation({
    mutationFn: (v: { receiptId: string; images: Blob[]; lang: string }) =>
      apiUploadReceipt<ReceiptDraft>(v.receiptId, v.images, v.lang),
  });
}

/** Lưu hóa đơn: gửi trực tiếp, không xếp hàng. receipt_id làm khóa idempotent. */
export function useSaveReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: ReceiptDraft & { use_for_prediction: boolean }) =>
      apiSend("POST", "/receipts", draft, draft.receipt_id),
    onSuccess: () => qc.invalidateQueries(),
  });
}
