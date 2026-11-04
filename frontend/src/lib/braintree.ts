/**
 * Nạp Braintree Drop-in UI một lần cho lựa chọn "Trả bằng thẻ". Số thẻ do Drop-in gửi
 * thẳng cho Braintree; app chỉ nhận lại nonce dùng một lần và gửi cho server Mimi.
 * Server chạy BRAINTREE_MODE=fake thì trả FAKE_CLIENT_TOKEN, app dùng nút giả lập.
 */
export const FAKE_CLIENT_TOKEN = "fake-client-token";
/** Nonce thẻ hợp lệ của Braintree Sandbox; server giả lập chỉ nhận nonce này. */
export const FAKE_NONCE = "fake-valid-nonce";

const DROPIN_VERSION = "1.47.0";

export type DropinInstance = {
  requestPaymentMethod: () => Promise<{ nonce: string }>;
  teardown: () => Promise<void>;
};
type DropinNamespace = {
  create: (opts: { authorization: string; container: HTMLElement; locale?: string; card?: Record<string, unknown> }) => Promise<DropinInstance>;
};

let loading: Promise<DropinNamespace> | null = null;

export function loadDropin(): Promise<DropinNamespace> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://js.braintreegateway.com/web/dropin/${DROPIN_VERSION}/js/dropin.min.js`;
    s.async = true;
    s.onload = () => {
      const bt = (window as unknown as { braintree?: { dropin?: DropinNamespace } }).braintree;
      if (bt?.dropin) resolve(bt.dropin);
      else reject(new Error("Braintree Drop-in did not load"));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error("Braintree Drop-in failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
