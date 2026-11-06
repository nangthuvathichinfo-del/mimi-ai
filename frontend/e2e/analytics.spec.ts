import { expect, test, type Page } from "@playwright/test";

// Màn Phân tích chi tiêu (AG Studio) trên bản thử: bảng dựng sẵn hiện đủ widget của Mimi,
// "Hỏi Mimi" gọi tool của Mimi và trả lời (bản thử dùng mô hình viết tay, xem src/api/mockAi.ts).

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

async function signIn(page: Page) {
  await page.goto("/?ui=vi");
  await page.locator("input[type=email]").fill("lan@gmail.com");
  await page.locator("input").nth(1).fill("Lan");
  await page.getByRole("button", { name: "Nhận link đăng nhập" }).click();
  await page.getByText("Mở link (bản thử)").click();
  await expect(page.getByText("Chào Lan!")).toBeVisible();
}

test("Phân tích chi tiêu: bảng, widget Mimi, Hỏi Mimi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);

  // Vào từ Sổ chi tiêu.
  await page.goto("/spending");
  await page.getByRole("link", { name: /Phân tích chi tiêu/ }).click();
  await expect(page.getByRole("heading", { name: "Phân tích chi tiêu" })).toBeVisible();

  // Widget riêng của Mimi đã có dữ liệu.
  await expect(page.getByText("Sắp hết trước")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".radar__name").first()).toBeVisible();
  await expect(page.locator(".saved__num")).toContainText("đ");

  // Trang So sánh giá: bảng AG Grid có giá online.
  await page.getByRole("button", { name: "So sánh giá", exact: true }).click();
  await expect(page.getByText("Giá đang bán của từng món, rẻ nhất trước")).toBeVisible();
  await expect(page.locator(".ag-row").first()).toBeVisible();

  // Hỏi Mimi: chọn câu gợi ý, Mimi gọi tool món sắp hết rồi trả lời.
  await page.getByRole("button", { name: "Hỏi Mimi", exact: true }).click();
  await page.getByText("Tuần này cần mua gì?").click();
  await expect(page.getByText("Mimi xem món sắp hết")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Các món sắp hết trong 7 ngày:")).toBeVisible();

  expect(errors).toEqual([]);
});
