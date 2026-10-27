import {
  validateClipboardImageItem,
  validateClipboardImageWrite,
} from './clipboard-image.js';

const wipe = (item) => {
  if (item?.rgba instanceof Uint8Array && item.rgba.byteLength)
    item.rgba.fill(0);
};

/** Own exactly one disposable decoder/encoder; cancel/deadline terminates it. */
export class ClipboardImageConversion {
  active;
  disposed = false;
  constructor(
    createWorker = () =>
      new Worker(new URL('./clipboard-image-worker.js', import.meta.url), {
        type: 'module',
      }),
  ) {
    this.createWorker = createWorker;
  }
  run(operation, value, maximum) {
    if (this.disposed) return Promise.resolve({ status: 'unavailable' });
    if (this.active) return Promise.resolve({ status: 'busy' });
    let item;
    try {
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 16777216)
        throw new Error();
      if (operation === 'encode') {
        validateClipboardImageItem(value, maximum);
        item = {
          width: value.width,
          height: value.height,
          rgba: new Uint8Array(value.rgba),
        };
      } else if (
        operation !== 'decode' ||
        !(value instanceof Blob) ||
        value.type !== 'image/png' ||
        value.size < 45 ||
        value.size > 16777216
      )
        throw new Error();
    } catch {
      wipe(item);
      return Promise.resolve({ status: 'invalid' });
    }
    return new Promise((resolve) => {
      const job = { resolve, item, worker: undefined, timer: undefined };
      this.active = job;
      const finish = (result) => {
        if (this.active !== job) {
          wipe(result.item);
          return;
        }
        this.active = undefined;
        clearTimeout(job.timer);
        if (job.worker) {
          job.worker.onmessage =
            job.worker.onerror =
            job.worker.onmessageerror =
              null;
          job.worker.terminate();
        }
        wipe(job.item);
        resolve(result);
      };
      job.finish = finish;
      try {
        job.worker = this.createWorker();
        job.worker.onmessage = ({ data }) => {
          try {
            if (
              !data ||
              data.v !== 1 ||
              !['accepted', 'invalid'].includes(data.status)
            )
              throw new Error();
            if (data.status === 'invalid') {
              if (data.item !== undefined || data.blob !== undefined)
                throw new Error();
              finish({ status: 'invalid' });
            } else if (operation === 'decode') {
              if (data.blob !== undefined) throw new Error();
              validateClipboardImageWrite(data.item, maximum);
              finish({
                status: 'accepted',
                item: {
                  width: data.item.width,
                  height: data.item.height,
                  rgba: data.item.rgba,
                },
              });
            } else {
              if (
                data.item !== undefined ||
                !(data.blob instanceof Blob) ||
                data.blob.type !== 'image/png' ||
                data.blob.size < 45 ||
                data.blob.size > 16777216
              )
                throw new Error();
              finish({ status: 'accepted', blob: data.blob });
            }
          } catch {
            wipe(data?.item);
            finish({ status: 'invalid' });
          }
        };
        job.worker.onerror = (event) => {
          event.preventDefault();
          finish({ status: 'invalid' });
        };
        job.worker.onmessageerror = () => finish({ status: 'invalid' });
        job.timer = setTimeout(() => finish({ status: 'timeout' }), 5000);
        job.worker.postMessage(
          {
            v: 1,
            operation,
            maximum,
            ...(operation === 'decode' ? { blob: value } : { item }),
          },
          operation === 'encode' ? [item.rgba.buffer] : [],
        );
      } catch {
        finish({ status: 'invalid' });
      }
    });
  }
  cancel() {
    this.active?.finish({ status: 'cancelled' });
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
