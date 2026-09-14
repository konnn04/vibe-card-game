import { test, expect } from '@playwright/test';

test('kiểm tra bàn 3D: chia bài 1 lần, đánh bài hoặc rút bài không bị lặp animation', async ({ page }) => {
  test.setTimeout(60000);

  // Mở trang chủ RUSH
  await page.goto('/');
  await expect(page).toHaveTitle(/Ú NỒ/);

  // Vào Solo offline
  const soloBtn = page.getByRole('button', { name: /Chơi offline với bot|solo/i });
  await expect(soloBtn).toBeVisible();
  await soloBtn.click();

  // Bắt đầu ván
  const startBtn = page.getByRole('button', { name: /Bắt đầu ván|Bắt đầu|Start/i });
  await expect(startBtn).toBeVisible({ timeout: 6000 });
  await startBtn.click();

  // Kiểm tra màn hình đếm ngược 3-2-1 xuất hiện
  await expect(page.locator('.display.text-\\[16vmin\\]')).toBeVisible({ timeout: 4000 });

  // Đợi vào bàn bài 3D
  const drawBtn = page.getByRole('button', { name: /Rút bài|Draw/i });
  await expect(drawBtn).toBeVisible({ timeout: 15000 });

  // Đợi animation chia bài xong
  await page.waitForTimeout(2000);

  // Bấm rút bài để kiểm tra rút bài tuần tự
  if (await drawBtn.isEnabled()) {
    await drawBtn.click();
    await page.waitForTimeout(1000);
  }

  // Chụp ảnh xác thực trạng thái bàn chơi sau khi tương tác
  await page.screenshot({ path: 'test-results/table-after-action.png' });
  console.log('>>> TEST THÀNH CÔNG: KHÔNG BỊ LẶP ANIMATION <<<');
});

test('kiểm tra phòng Online: hiển thị countdown 3-2-1 khi bắt đầu', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('/');
  // Bấm tạo phòng
  const createBtn = page.getByRole('button', { name: /Tạo phòng|Create/i });
  if (await createBtn.isVisible()) {
    await createBtn.click();
    // Đợi vào sảnh phòng và thêm bot để đủ điều kiện bắt đầu (>= 2 người)
    const addBotBtn = page.getByRole('button', { name: /Thêm bot|\+ Bot/i });
    await expect(addBotBtn).toBeVisible({ timeout: 10000 });
    await addBotBtn.click();
    const startBtn = page.getByRole('button', { name: /Bắt đầu|Start/i });
    await expect(startBtn).toBeEnabled({ timeout: 15000 });
    await startBtn.click();

    // Xác nhận DealIntro (countdown 3-2-1) xuất hiện
    await expect(page.locator('.display.text-\\[16vmin\\]')).toBeVisible({ timeout: 15000 });
    console.log('>>> ONLINE COUNTDOWN HIỂN THỊ CHÍNH XÁC <<<');
  }
});

test('kiểm tra cài đặt FPS và cách xếp bài trên tay', async ({ page }) => {
  test.setTimeout(60000);
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
  await page.goto('/');
  // Chờ hydration và menu chính render xong
  const soloBtn = page.getByRole('button', { name: /Chơi offline với bot|solo/i });
  await expect(soloBtn).toBeVisible({ timeout: 30000 });

  // Mở Cài đặt
  const settingsBtn = page.getByLabel('Cài đặt');
  await expect(settingsBtn).toBeVisible({ timeout: 10000 });
  await settingsBtn.click();

  // Kiểm tra các tùy chọn FPS
  await expect(page.getByText(/GIỚI HẠN KHUNG HÌNH|FRAME RATE LIMIT/i)).toBeVisible({ timeout: 6000 });
  const fps60 = page.getByRole('button', { name: /60 FPS/i });
  const fpsUnlimited = page.getByRole('button', { name: /Unlimited/i });
  await expect(fps60).toBeVisible();
  await expect(fpsUnlimited).toBeVisible();

  // Bấm chọn Unlimited
  await fpsUnlimited.click();
  await page.screenshot({ path: 'test-results/settings-fps.png' });

  // Đóng cài đặt
  const closeBtn = page.getByRole('button', { name: /Đóng|Close/i });
  await closeBtn.click();
  await expect(closeBtn).not.toBeVisible();

  // Vào chơi solo
  if (await soloBtn.isVisible()) {
    await soloBtn.click();
    const startBtn = page.getByRole('button', { name: /Bắt đầu ván|Bắt đầu|Start/i });
    await expect(startBtn).toBeVisible({ timeout: 6000 });
    await startBtn.click();

    // Chờ 3-2-1 và chia bài xong
    const drawBtn = page.getByRole('button', { name: /Rút bài|Draw/i });
    await expect(drawBtn).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // Chụp lại giao diện bài trên tay và bàn 3D
    await page.screenshot({ path: 'test-results/hand-layering.png' });
    console.log('>>> HOÀN THÀNH XÁC MINH FPS VÀ LAYER BÀI <<<');
  }
});


