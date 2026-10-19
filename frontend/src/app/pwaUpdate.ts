import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Cập nhật PWA. Service worker chỉ tự kiểm tra bản mới khi trang được điều hướng, mà app đã cài
 * thường mở nền rất lâu. Vì vậy ta chủ động kiểm tra khi người dùng quay lại app và mỗi 30 phút.
 * Khi có bản mới, UpdateBanner hỏi người dùng rồi mới tải lại.
 */
const CHECK_EVERY_MS = 30 * 60 * 1000;

let ready = false;
let apply: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function setReady(v: boolean) {
  ready = v;
  listeners.forEach((l) => l());
}

export function startPwaUpdates() {
  if (apply) return;
  apply = registerSW({
    immediate: true,
    onNeedRefresh: () => setReady(true),
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine) reg.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.setInterval(check, CHECK_EVERY_MS);
    },
  });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ready,
    () => false,
  );
}

/** Kích hoạt service worker mới rồi tải lại trang. */
export function applyUpdate() {
  void apply?.(true);
}
