import { expect, test } from "@playwright/test";

// Mimi 2.2: màn Kế hoạch (đề xuất chốt 09/11): thẻ kế hoạch chưa lưu, luồng 3 bước, 3 tab.
test("Kế hoạch 2.2: lưu kế hoạch nháp qua 3 bước, thêm món sắp hết một chạm, 3 tab", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?ui=vi&uiv2=1");
  await page.locator("input[type=email]").fill("lan@gmail.com");
  await page.locator("input").nth(1).fill("Lan");
  await page.getByRole("button", { name: "Nhận link đăng nhập" }).click();
  await page.getByText("Mở link (bản thử)").click();
  await page.getByText("Chào Lan!").waitFor();
  await page.goto("/plan");

  // Thẻ đầu: kế hoạch chưa lưu, thanh 3 bước ở bước 2, giá cũ gạch ngang.
  const card = page.locator(".draft22");
  await expect(card.getByText("Bước 2/3 · So sánh giá")).toBeVisible();
  await expect(card.locator(".pl22__price s").first()).toBeVisible();

  // So sánh giá theo từng món: rẻ nhất được chọn sẵn.
  await card.getByRole("button", { name: /So sánh giá/ }).click();
  const first = page.locator(".cmpi22").first();
  await expect(first.getByRole("radio").first()).toHaveAttribute("aria-checked", "true");
  await expect(first.getByText("Thấp nhất")).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  // Xác nhận: phải chọn người mua; Tôi mua thì Lưu kế hoạch và ra màn kết quả.
  await expect(page.getByRole("button", { name: "Lưu kế hoạch" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("radio", { name: /Tôi mua/ }).click();
  await page.getByRole("button", { name: "Lưu kế hoạch" }).click();
  await expect(page.getByRole("heading", { name: "Đã lưu kế hoạch" })).toBeVisible();
  await page.getByRole("link", { name: "Về Kế hoạch" }).click();

  // Kế hoạch đã lưu xuống mục dưới, thẻ đầu trống.
  await expect(page.locator(".plancard15", { hasText: "Giỏ mua sắm" })).toBeVisible();
  await expect(page.locator(".draft22")).toHaveCount(0);

  // Kế hoạch mới: trống, bước 1, thêm món sắp hết một chạm có Hoàn tác.
  await page.getByRole("button", { name: /Kế hoạch mới/ }).click();
  await expect(page.locator(".draft22").getByText("Bước 1/3 · Thêm món")).toBeVisible();
  await page.getByRole("button", { name: /Thêm \d+ món sắp hết/ }).click();
  await expect(page.getByRole("button", { name: "Hoàn tác" })).toBeVisible();
  await expect(page.locator(".draft22").getByText("Bước 2/3 · So sánh giá")).toBeVisible();

  // Ba tab.
  // Tab Được nhờ mua giữ như 2.1: chỉ danh sách kế hoạch được nhờ.
  await page.getByRole("button", { name: /Được nhờ mua/ }).click();
  await expect(page.locator(".plancard15", { hasText: "Nhờ từ Minh" })).toBeVisible();
  await page.getByRole("button", { name: "Tất cả đơn" }).click();
  await expect(page.getByText("Đã chi qua kế hoạch")).toBeVisible();
  // Tất cả đơn gồm cả kế hoạch đã lưu (Giỏ mua sắm) và kế hoạch được nhờ.
  await page.getByRole("button", { name: "Đang làm" }).click();
  await expect(page.locator(".past22", { hasText: "Giỏ mua sắm" })).toBeVisible();
  await page.getByRole("button", { name: "Nhờ mua", exact: true }).click();
  await expect(page.locator(".past22", { hasText: "Nhờ từ Minh" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  expect(errors).toEqual([]);
});
