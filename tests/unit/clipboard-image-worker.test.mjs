import test from 'node:test';
import assert from 'node:assert/strict';
let sequence = 0;
const header = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
const blob = (first = header) =>
  new Blob([first, new Uint8Array(12)], { type: 'image/png' });
async function fixture(run, options = {}) {
  const names = ['self', 'createImageBitmap', 'OffscreenCanvas', 'ImageData'];
  const saved = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const f = {
    bitmap: 0,
    bitmapClosed: 0,
    canvas: 0,
    closed: 0,
    messages: [],
    pixels: new Uint8ClampedArray([123, 45, 67, 255]),
  };
  globalThis.self = {
    postMessage(data, transfer = []) {
      f.messages.push(structuredClone(data, { transfer }));
    },
    close() {
      ++f.closed;
    },
  };
  globalThis.createImageBitmap = async () => {
    ++f.bitmap;
    return {
      width: options.wrongSize ? 2 : 1,
      height: 1,
      close() {
        ++f.bitmapClosed;
      },
    };
  };
  globalThis.ImageData = class {
    constructor(data, width, height) {
      Object.assign(this, { data, width, height });
    }
  };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      ++f.canvas;
      f.surface = this;
      Object.assign(this, { width, height });
    }
    getContext() {
      return {
        drawImage() {},
        getImageData() {
          return {
            data: f.pixels,
            colorSpace: options.wrongColor ? 'display-p3' : 'srgb',
          };
        },
        putImageData(image) {
          f.put = Array.from(image.data);
        },
      };
    }
    async convertToBlob() {
      f.zeroBeforeEncodeCompletion = f.input.rgba.every((v) => !v);
      return blob();
    }
  };
  try {
    await import(
      '../../apps/reference-harness/clipboard-image-worker.js?fixture=' +
        sequence++
    );
    await run(f, self.onmessage);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
test('browser image worker refuses PNG geometry/quota/CRC before constructing a decoder or canvas', async () => {
  for (const [png, maximum] of [
    [blob(), 127],
    [blob(Buffer.from(header.map((v, n) => (n === 29 ? v ^ 255 : v)))), 128],
    [new Blob([new Uint8Array(44)], { type: 'image/png' }), 128],
  ]) {
    await fixture(async (f, receive) => {
      await receive({
        data: { v: 1, operation: 'decode', maximum, blob: png },
      });
      assert.deepEqual(f.messages, [{ v: 1, status: 'invalid' }]);
      assert.equal(f.bitmap + f.canvas, 0);
      assert.equal(f.closed, 1);
    });
  }
});
test('browser image worker decoded output transfers pixels and closes its bitmap/canvas', async () => {
  await fixture(async (f, receive) => {
    await receive({
      data: { v: 1, operation: 'decode', maximum: 128, blob: blob() },
    });
    assert.equal(f.messages[0].status, 'accepted');
    assert.deepEqual(Array.from(f.messages[0].item.rgba), [123, 45, 67, 255]);
    assert.equal(f.pixels.byteLength, 0);
    assert.equal(f.bitmapClosed, 1);
    assert.equal(f.surface.width + f.surface.height, 0);
    assert.equal(f.closed, 1);
    f.messages[0].item.rgba.fill(0);
  });
});
test('browser image worker refused decoder size or color closes resources and wipes retained pixels', async () => {
  for (const options of [{ wrongSize: true }, { wrongColor: true }])
    await fixture(async (f, receive) => {
      await receive({
        data: { v: 1, operation: 'decode', maximum: 128, blob: blob() },
      });
      assert.equal(f.messages[0].status, 'invalid');
      assert.equal(f.bitmapClosed, 1);
      if (options.wrongColor) assert.ok(f.pixels.every((v) => !v));
      if (f.surface) assert.equal(f.surface.width + f.surface.height, 0);
      assert.equal(f.closed, 1);
    }, options);
});
test('browser image worker encoder consumes only its transferred pixels and wipes before awaiting PNG completion', async () => {
  await fixture(async (f, receive) => {
    f.input = { width: 1, height: 1, rgba: new Uint8Array([123, 45, 67, 255]) };
    await receive({
      data: { v: 1, operation: 'encode', maximum: 4, item: f.input },
    });
    assert.deepEqual(f.put, [123, 45, 67, 255]);
    assert.equal(f.zeroBeforeEncodeCompletion, true);
    assert.ok(f.input.rgba.every((v) => !v));
    assert.equal(f.messages[0].status, 'accepted');
    assert.equal(f.surface.width + f.surface.height, 0);
    assert.equal(f.closed, 1);
  });
});
