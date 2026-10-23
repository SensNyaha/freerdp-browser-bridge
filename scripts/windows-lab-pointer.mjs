import { setTimeout as delay } from 'node:timers/promises';

// Only for the separately user-opened, network-free rdp-pointer-page.html.
// Readbacks are fixed scalar receipts, never arbitrary application text.
export async function runWindowsPointerSmoke({ page, snapshot, reattach }) {
  const requireResult = (ok) => {
    if (!ok) throw new Error('LAB_CHECK_FAILED');
  };
  const baseline = await snapshot();
  const canvas = page.locator('#desktop');
  let box;
  const prepare = async () => {
    await canvas.scrollIntoViewIfNeeded();
    box = await canvas.boundingBox();
    requireResult(Boolean(box));
  };
  await prepare();
  const point = (x, y) => [box.x + box.width * x, box.y + box.height * y];
  for (const button of ['left', 'right', 'middle'])
    await page.mouse.click(...point(0.5, 0.5), { button });
  await page.mouse.move(...point(0.35, 0.35));
  await page.mouse.down();
  await page.mouse.move(...point(0.65, 0.65), { steps: 8 });
  await page.mouse.up();
  for (const [x, y] of [
    [0, 240],
    [0, -240],
    [240, 0],
    [-240, 0],
  ]) {
    await page.mouse.wheel(x, y);
    await delay(200);
  }
  const input = await snapshot();
  for (let button = 0; button < 3; button++) {
    requireResult(input.down[button] > baseline.down[button]);
    requireResult(input.up[button] > baseline.up[button]);
    requireResult(input.down[button] === input.up[button]);
  }
  requireResult(input.moves > baseline.moves && input.buttons === 0);
  requireResult(input.dragX > 100 && input.dragY > 100);
  for (const name of ['left', 'right', 'up', 'down'])
    requireResult(input.wheel[name] > baseline.wheel[name]);
  await prepare();
  await page.mouse.move(...point(0.5, 0.5));
  await page.mouse.down();
  await delay(200);
  await page.locator('#unicode-text').focus();
  const local = await page.locator('#unicode-text').boundingBox();
  requireResult(Boolean(local));
  await page.mouse.move(local.x + local.width / 2, local.y + local.height / 2);
  await page.mouse.up();
  const blurred = await snapshot();
  requireResult(blurred.buttons === 0);
  requireResult(blurred.down[0] === input.down[0] + 1);
  requireResult(blurred.up[0] === blurred.down[0]);
  await prepare();
  await page.mouse.move(...point(0.5, 0.5));
  await page.mouse.down({ button: 'middle' });
  await delay(200);
  await reattach(() => page.mouse.up({ button: 'middle' }));
  const detached = await snapshot();
  requireResult(detached.buttons === 0);
  requireResult(detached.down[1] === blurred.down[1] + 1);
  requireResult(detached.up[1] === detached.down[1]);
  return {
    buttons: [0, 1, 2],
    drag: true,
    wheel: ['left', 'right', 'up', 'down'],
    blurLeftRelease: true,
    detachMiddleRelease: true,
    final: detached,
  };
}

export function parsePointerReceipt(text) {
  const refuse = () => {
    throw new Error('LAB_POINTER_RECEIPT_REFUSED');
  };
  if (typeof text !== 'string' || text.length > 512) refuse();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    refuse();
  }
  const scalar = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 65535;
  if (
    !value ||
    Object.keys(value).sort().join() !==
      'buttons,down,dragX,dragY,fixture,moves,up,v,wheel' ||
    value.v !== 1 ||
    value.fixture !== 'bridge-pointer-v1' ||
    !['down', 'up'].every(
      (name) =>
        Array.isArray(value[name]) &&
        value[name].length === 3 &&
        value[name].every(scalar),
    ) ||
    !['moves', 'dragX', 'dragY', 'buttons'].every((name) =>
      scalar(value[name]),
    ) ||
    value.buttons > 7 ||
    !value.wheel ||
    Object.keys(value.wheel).sort().join() !== 'down,left,right,up' ||
    !Object.values(value.wheel).every(scalar)
  )
    refuse();
  return value;
}
