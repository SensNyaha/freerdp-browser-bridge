import {
  inspectClipboardPngHeader,
  validateClipboardImageItem,
  validateClipboardImageWrite,
} from './clipboard-image.js';

// One bounded conversion per disposable worker. No URL/file loading, OS APIs,
// logging or retention. The host terminates this realm on deadline/cancellation.
self.onmessage = async ({ data }) => {
  self.onmessage = null;
  let bitmap, canvas, pixels;
  try {
    if (
      !data ||
      data.v !== 1 ||
      !Number.isInteger(data.maximum) ||
      data.maximum < 1 ||
      data.maximum > 16777216
    )
      throw new Error();
    if (data.operation === 'decode') {
      const blob = data.blob;
      if (
        !(blob instanceof Blob) ||
        blob.type !== 'image/png' ||
        blob.size < 45 ||
        blob.size > 16777216
      )
        throw new Error();
      const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
      let geometry;
      try {
        geometry = inspectClipboardPngHeader(header, data.maximum);
      } finally {
        header.fill(0);
      }
      if (geometry.rgbaBytes > data.maximum - 124) throw new Error();
      bitmap = await createImageBitmap(blob, {
        imageOrientation: 'none',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'default',
      });
      if (bitmap.width !== geometry.width || bitmap.height !== geometry.height)
        throw new Error();
      canvas = new OffscreenCanvas(geometry.width, geometry.height);
      const context = canvas.getContext('2d', {
        colorSpace: 'srgb',
        willReadFrequently: true,
      });
      if (!context) throw new Error();
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(
        0,
        0,
        geometry.width,
        geometry.height,
        { colorSpace: 'srgb', pixelFormat: 'rgba-unorm8' },
      );
      if (image.data instanceof Uint8ClampedArray)
        pixels = new Uint8Array(
          image.data.buffer,
          image.data.byteOffset,
          image.data.byteLength,
        );
      if (!pixels || image.colorSpace !== 'srgb') throw new Error();
      const item = {
        width: geometry.width,
        height: geometry.height,
        rgba: pixels,
      };
      validateClipboardImageWrite(item, data.maximum);
      self.postMessage({ v: 1, status: 'accepted', item }, [pixels.buffer]);
      pixels = undefined;
    } else if (data.operation === 'encode') {
      const item = data.item;
      pixels = item?.rgba;
      validateClipboardImageItem(item, data.maximum);
      canvas = new OffscreenCanvas(item.width, item.height);
      const context = canvas.getContext('2d', { colorSpace: 'srgb' });
      if (!context) throw new Error();
      context.putImageData(
        new ImageData(
          new Uint8ClampedArray(
            pixels.buffer,
            pixels.byteOffset,
            pixels.byteLength,
          ),
          item.width,
          item.height,
          { colorSpace: 'srgb' },
        ),
        0,
        0,
      );
      pixels.fill(0);
      pixels = undefined;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (
        !(blob instanceof Blob) ||
        blob.type !== 'image/png' ||
        blob.size < 45 ||
        blob.size > 16777216
      )
        throw new Error();
      self.postMessage({ v: 1, status: 'accepted', blob });
    } else throw new Error();
  } catch {
    self.postMessage({ v: 1, status: 'invalid' });
  } finally {
    if (pixels instanceof Uint8Array && pixels.byteLength) pixels.fill(0);
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
    self.close();
  }
};
