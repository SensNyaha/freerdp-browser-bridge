/** Bounded private lab bootstrap; never echo a bearer or parser diagnostic. */
export async function readLinuxViewerBootstrap(input) {
  const bytes = Buffer.alloc(1024);
  let length = 0;
  try {
    for await (const chunk of input) {
      if (!Buffer.isBuffer(chunk)) throw new Error();
      try {
        if (chunk.length > bytes.length - length) throw new Error();
        chunk.copy(bytes, length);
        length += chunk.length;
      } finally {
        chunk.fill(0);
      }
    }
    const value = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) =>
          ![
            'bearer',
            'soak',
            'htmlClipboard',
            'imageClipboard',
            'ipcTransport',
          ].includes(key),
      ) ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.bearer ?? '') ||
      ['soak', 'htmlClipboard', 'imageClipboard'].some(
        (key) => value[key] !== undefined && typeof value[key] !== 'boolean',
      ) ||
      (value.ipcTransport !== undefined &&
        !['auto', 'framed-pipes'].includes(value.ipcTransport)) ||
      (value.htmlClipboard === true && value.imageClipboard === true) ||
      (value.soak === true &&
        (value.htmlClipboard === true || value.imageClipboard === true)) ||
      (value.ipcTransport !== undefined &&
        value.htmlClipboard !== true &&
        value.imageClipboard !== true)
    )
      throw new Error();
    return {
      bearer: value.bearer,
      soak: value.soak === true,
      htmlClipboard: value.htmlClipboard === true,
      ...(value.imageClipboard === true ? { imageClipboard: true } : {}),
      ipcTransport: value.ipcTransport ?? 'auto',
    };
  } catch {
    throw new Error('Invalid Linux viewer bootstrap');
  } finally {
    bytes.fill(0);
  }
}
