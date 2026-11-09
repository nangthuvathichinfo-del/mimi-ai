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
  // Thanh toán online chỉ có giá Channel3, mà Channel3 chỉ có ở Mỹ: chuyển sang Mỹ trong app (tải lại trang thì mất dữ liệu bản thử).
  const go = (path: string) =>
    page.evaluate((p) => {
      history.pushState({}, "", p);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  await go("/settings/language");
  await page.getByRole("combobox", { name: /Quốc gia/ }).selectOption("US");
  await page.waitForTimeout(500);
  await go("/plan");

  // Kế hoạch chưa lưu ở đầu màn chính là màn bước 1: thông tin kế hoạch, danh sách món, nút Tiếp tục.
  const card = page.locator(".top22");
  const nameBox = card.getByRole("textbox", { name: "Tên kế hoạch" });
  await expect(nameBox).toHaveValue("Giỏ mua sắm");
  // Giỏ mua sắm đổi tên được khi còn nháp; lưu thì thành tên kế hoạch mới.
  await nameBox.fill("Đi chợ cuối tuần");
  await nameBox.press("Enter");
  await expect(card.getByText("Thêm vào Google Calendar")).toBeVisible();
  await expect(card.getByRole("button", { name: "Thêm món", exact: true })).toBeVisible();

  // So sánh giá theo từng món: rẻ nhất được chọn sẵn.
  await card.getByRole("button", { name: "Tiếp tục" }).click();
  const first = page.locator(".cmpi22").first();
  await expect(first.getByRole("radio").first()).toHaveAttribute("aria-checked", "true");
  await expect(first.getByText("Thấp nhất")).toBeVisible();
  // Nút Chi tiết tách khỏi việc chọn dòng: xem chi tiết giá thứ hai rồi chọn giá đó, sau đó chọn lại giá rẻ nhất.
  await first.getByRole("button", { name: /Chi tiết giá/ }).nth(1).click();
  await expect(page.getByText("Nơi bán")).toBeVisible();
  await page.getByRole("button", { name: "Chọn giá này" }).click();
  await expect(first.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
  await first.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  // Bước 3: chỉ giá Channel3 vào Thanh toán online; giá hóa đơn và Gemini là mua tại cửa hàng, phải chọn người mua.
  await expect(page.getByText(/tách thành 2 kế hoạch/)).toBeVisible();
  const save = page.getByRole("button", { name: "Lưu, tách 2 kế hoạch" });
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("radio", { name: /Tôi mua/ }).click();
  await save.click();
  await expect(page.getByRole("heading", { name: "Đã tách thành 2 kế hoạch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thanh toán online ngay" })).toBeVisible();
  await page.getByRole("link", { name: "Về Kế hoạch" }).click();

  // Hai kế hoạch đã lưu xuống mục dưới; Giỏ mua sắm trống thành nháp mới ở bước 1.
  await expect(page.locator(".plancard15", { hasText: "Đi chợ cuối tuần · Online" })).toBeVisible();
  await expect(page.locator(".top22").getByRole("button", { name: "Tiếp tục" })).toHaveAttribute("aria-disabled", "true");

  // Kế hoạch đã lưu: xác nhận đã mua xong thì sang Tất cả đơn, mục Đã hoàn thành.
  await page.locator(".plancard15", { hasText: "Đi chợ cuối tuần · Online" }).click();
  await page.getByRole("button", { name: "Xác nhận đã mua xong" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await page.getByRole("button", { name: "Đã hoàn thành", exact: true }).click();
  await expect(page.locator(".past22", { hasText: "Đi chợ cuối tuần · Online" })).toBeVisible();
  await page.getByRole("button", { name: "Của tôi" }).click();

  // Kế hoạch mới: trống, bước 1, chạm tên món sắp hết để thêm.
  await page.getByRole("button", { name: /Kế hoạch mới/ }).click();
  await expect(page.locator(".top22").getByRole("textbox", { name: "Tên kế hoạch" })).toHaveValue(/^Kế hoạch \d/);
  const next = page.locator(".top22").getByRole("button", { name: "Tiếp tục" });
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.locator(".top22").getByRole("button", { name: /Thêm cả \d+ món/ }).click();
  await expect(next).not.toHaveAttribute("aria-disabled", "true");

  // Thêm sản phẩm: tên món nằm ngang, chạm tên là thêm (không có nút Thêm riêng).
  await page.locator(".top22").getByRole("button", { name: "Thêm món", exact: true }).click();
  await page.getByRole("button", { name: /Thêm sản phẩm/ }).click();
  await page.getByRole("textbox", { name: /Tìm nhóm hàng/ }).fill("nước");
  const chip = page.locator(".chips22 .chip22:not(.chip22--new)").first();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Xong" }).click();
  await expect(page.getByRole("button", { name: "Xong" })).toHaveCount(0);

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
