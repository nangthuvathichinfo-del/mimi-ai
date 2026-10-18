/**
 * Nén ảnh hóa đơn ngay trên máy trước khi gửi.
 * - Cạnh dài tối đa 1600px, JPEG chất lượng 0.8: đủ cho Gemini đọc chữ nhỏ.
 * - Vẽ lại qua canvas nên toàn bộ EXIF (kể cả vị trí GPS) bị bỏ, đúng nguyên tắc riêng tư.
 * - createImageBitmap với imageOrientation "from-image" để ảnh chụp dọc không bị xoay.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function compressReceiptImage(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  // Giải phóng bộ nhớ canvas ngay; ảnh không được giữ lâu hơn cần thiết.
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("encode_failed");
  return blob;
}

/** Chụp một khung hình từ luồng camera đang mở. */
export async function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("encode_failed");
  return compressReceiptImage(blob);
}
