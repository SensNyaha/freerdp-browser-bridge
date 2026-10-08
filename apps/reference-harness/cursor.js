/** Independent cursor stream: bounded RGBA shape, local motion and server visibility. */
export function installCursor(desktop) {
  const overlay = document.createElement('canvas');
  overlay.id = 'cursor-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    background: 'transparent',
    margin: '0',
    maxWidth: 'none',
    zIndex: '10',
    display: 'none',
  });
  document.body.append(overlay);
  let disposed = false,
    inside = false,
    visible = true,
    system = true;
  let expectedShape = 0n,
    shapeId = 0n,
    sequence = 0,
    hotX = 0,
    hotY = 0,
    x = 0,
    y = 0;
  const update = () => {
    if (disposed) return;
    desktop.style.cursor = visible && system ? 'default' : 'none';
    const bounds = desktop.getBoundingClientRect();
    const ready =
      visible &&
      !system &&
      inside &&
      expectedShape === shapeId &&
      shapeId !== 0n &&
      desktop.width > 0 &&
      desktop.height > 0;
    overlay.style.display = ready ? 'block' : 'none';
    if (!ready) return;
    const sx = bounds.width / desktop.width,
      sy = bounds.height / desktop.height;
    Object.assign(overlay.style, {
      left: `${bounds.left + (x - hotX) * sx}px`,
      top: `${bounds.top + (y - hotY) * sy}px`,
      width: `${overlay.width * sx}px`,
      height: `${overlay.height * sy}px`,
    });
  };
  const move = (event) => {
    const bounds = desktop.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    inside = true;
    x = Math.max(
      0,
      Math.min(
        desktop.width - 1,
        ((event.clientX - bounds.left) * desktop.width) / bounds.width,
      ),
    );
    y = Math.max(
      0,
      Math.min(
        desktop.height - 1,
        ((event.clientY - bounds.top) * desktop.height) / bounds.height,
      ),
    );
    update();
  };
  const leave = () => {
    inside = false;
    update();
  };
  desktop.addEventListener('pointermove', move);
  desktop.addEventListener('pointerleave', leave);
  window.addEventListener('scroll', update, true);
  const resize = new ResizeObserver(update);
  resize.observe(desktop);
  return {
    visibility(data) {
      if (
        typeof data.visible !== 'boolean' ||
        typeof data.default !== 'boolean' ||
        !/^(0|[1-9][0-9]{0,19})$/.test(data.shapeId) ||
        BigInt(data.shapeId) > 0xffffffffffffffffn ||
        data.default !== (data.shapeId === '0')
      )
        throw new Error('Invalid cursor visibility');
      visible = data.visible;
      system = data.default;
      expectedShape = BigInt(data.shapeId);
      update();
    },
    position(data) {
      if (
        ![data.x, data.y].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 65535,
        )
      )
        throw new Error('Invalid cursor position');
      x = data.x;
      y = data.y;
      update();
    },
    shape(bytes) {
      if (
        !(bytes instanceof ArrayBuffer) ||
        bytes.byteLength < 52 ||
        bytes.byteLength > 48 + 384 * 384 * 4
      )
        throw new Error('Invalid cursor record');
      const view = new DataView(bytes);
      const width = view.getUint16(40),
        height = view.getUint16(42),
        hx = view.getUint16(44),
        hy = view.getUint16(46);
      if (
        view.getUint32(0) !== 0x52574231 ||
        view.getUint8(4) !== 1 ||
        view.getUint8(5) !== 5 ||
        view.getUint16(6) !== 0 ||
        view.getUint32(8) !== 2 ||
        view.getUint32(12) !== sequence ||
        view.getUint32(24) !== bytes.byteLength - 28 ||
        view.getUint16(28) !== 1 ||
        view.getUint16(30) !== 1 ||
        view.getBigUint64(32) === 0n ||
        width < 1 ||
        height < 1 ||
        width > 384 ||
        height > 384 ||
        hx >= width ||
        hy >= height ||
        bytes.byteLength !== 48 + width * height * 4
      )
        throw new Error('Invalid cursor shape');
      sequence++;
      shapeId = view.getBigUint64(32);
      hotX = hx;
      hotY = hy;
      overlay.width = width;
      overlay.height = height;
      overlay
        .getContext('2d')
        .putImageData(
          new ImageData(new Uint8ClampedArray(bytes.slice(48)), width, height),
          0,
          0,
        );
      update();
    },
    dispose() {
      disposed = true;
      resize.disconnect();
      desktop.removeEventListener('pointermove', move);
      desktop.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', update, true);
      desktop.style.cursor = '';
      overlay.remove();
    },
  };
}
