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

  // Bước 3: có cả giá online và giá hóa đơn cũ thì tách 2 kế hoạch; phần cửa hàng phải chọn người mua.
  await expect(page.getByText(/tách thành 2 kế hoạch/)).toBeVisible();
  const save = page.getByRole("button", { name: "Lưu, tách 2 kế hoạch" });
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("radio", { name: /Tôi mua/ }).click();
  await save.click();
  await expect(page.getByRole("heading", { name: "Đã tách thành 2 kế hoạch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thanh toán online ngay" })).toBeVisible();
  await page.getByRole("link", { name: "Về Kế hoạch" }).click();

  // Hai kế hoạch đã lưu xuống mục dưới; Giỏ mua sắm trống thành nháp mới ở bước 1.
  await expect(page.locator(".plancard15", { hasText: "Giỏ mua sắm · Online" })).toBeVisible();
  await expect(page.locator(".draft22").getByText("Bước 1/3 · Thêm món")).toBeVisible();

  // Kế hoạch đã lưu: xác nhận đã mua xong thì sang Tất cả đơn, mục Đã hoàn thành.
  await page.locator(".plancard15", { hasText: "Giỏ mua sắm · Online" }).click();
  await page.getByRole("button", { name: "Xác nhận đã mua xong" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await page.getByRole("button", { name: "Đã hoàn thành", exact: true }).click();
  await expect(page.locator(".past22", { hasText: "Giỏ mua sắm · Online" })).toBeVisible();
  await page.getByRole("button", { name: "Của tôi" }).click();

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
  await page.getByRole("button", { name: "Chưa hoàn thành", exact: true }).click();
  await expect(page.locator(".past22", { hasText: "Mua đồ cho bé" })).toBeVisible();
  await page.getByRole("button", { name: "Nhờ mua", exact: true }).click();
  await expect(page.locator(".past22", { hasText: "Nhờ từ Minh" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  expect(errors).toEqual([]);
});
