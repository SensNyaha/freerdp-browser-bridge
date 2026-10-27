import assert from 'node:assert/strict';
import { ClipboardClient } from '../../apps/reference-harness/clipboard-client.js';
import { ClipboardTransfer } from '../../packages/node-bridge/dist/index.js';
const windowBytes = 4076 * 8;
export function clipboardClientFixture(
  maximum = 1048576,
  html = false,
  mode = 'bidirectional',
  image = false,
) {
  const f = {
    time: 0,
    seq: 0,
    tasks: [],
    frames: [],
    windows: [],
    closed: 0,
    queued: 0,
    written: undefined,
    readText: Buffer.from('remote\nЖ😀'),
    readBuffer: undefined,
    granted: false,
    descriptor: html ? { version: 1, itemMetadataBytes: 32 } : undefined,
    imageDescriptor: image
      ? {
          version: 1,
          itemMetadataBytes: 16,
          pixelFormat: 'rgba8-srgb-straight',
        }
      : undefined,
    readImage: {
      width: 2,
      height: 1,
      rgba: Buffer.from('12345678fedcba98', 'hex'),
    },
    readItem: {
      body: Buffer.from('<b>synthetic</b>'),
      fragmentOffset: 0,
      fragmentBytes: 16,
      selectionOffset: 0,
      selectionBytes: 0,
      context: false,
      selection: false,
      text: Buffer.from('synthetic'),
    },
    calls: {
      readHtml: 0,
      writeHtml: 0,
      readImage: 0,
      writeImage: 0,
      read: 0,
      write: 0,
    },
  };
  f.state = {
    ready: true,
    generation: 1n,
    revision: 1n,
    maximum,
    toServer: mode !== 'server-to-browser',
    fromServer: mode !== 'browser-to-server',
    remoteText: mode !== 'browser-to-server',
    localAccepted: false,
    localPending: false,
    remotePending: false,
    ...(image
      ? {
          image: true,
          remoteImage: mode !== 'browser-to-server',
          localImageAccepted: false,
        }
      : {}),
    ...(html
      ? {
          html: true,
          remoteHtml: mode !== 'browser-to-server',
          localHtmlAccepted: false,
        }
      : {}),
  };
  f.offer = (patch) => {
    Object.assign(f.state, patch);
    f.client.offer({
      protocol: 'RWC1',
      version: 1,
      chunkBytes: 4076,
      window: 8,
      granted: f.granted,
      retiring: false,
      ...(f.descriptor === undefined ? {} : { html: f.descriptor }),
      ...(f.imageDescriptor === undefined ? {} : { image: f.imageDescriptor }),
      state: {
        ...f.state,
        generation: String(f.state.generation),
        revision: String(f.state.revision),
      },
    });
  };
  f.client = new ClipboardClient(
    {
      authorized: () => true,
      bufferedAmount: () => f.queued,
      changed: () => {},
      failed: () => ++f.closed,
      sendControl: (type, data) => {
        const seq = f.seq++;
        f.tasks.push(() =>
          [
            'clipboard.set',
            'clipboard.html.set',
            'clipboard.image.set',
          ].includes(type)
            ? f.server.set(
                seq,
                BigInt(data.generation),
                data.bytes,
                type === 'clipboard.html.set'
                  ? 'html'
                  : type === 'clipboard.image.set'
                    ? 'image'
                    : 'text',
              )
            : [
                  'clipboard.request',
                  'clipboard.html.request',
                  'clipboard.image.request',
                ].includes(type)
              ? f.server.read(
                  seq,
                  BigInt(data.generation),
                  BigInt(data.revision),
                  type === 'clipboard.html.request'
                    ? 'html'
                    : type === 'clipboard.image.request'
                      ? 'image'
                      : 'text',
                )
              : f.server.acknowledge(data.requestSeq, data.offset),
        );
        return seq;
      },
      sendBinary: (frame) => {
        assert.ok(f.client.active.frames.length <= 8);
        f.frames.push(frame);
        const bytes = Buffer.from(new Uint8Array(frame));
        if (bytes.readUInt32BE(12) % windowBytes === 0) f.windows.push(f.time);
        f.tasks.push(() => {
          f.server.receive(bytes);
          bytes.fill(0);
        });
        return true;
      },
    },
    () => f.time,
  );
  f.server = new ClipboardTransfer(
    {
      snapshot: () => ({ state: f.state, granted: f.granted, retiring: false }),
      start: () => {
        f.granted = true;
        f.offer();
        return true;
      },
      read: async () => {
        ++f.calls.read;
        f.readBuffer = Buffer.from(f.readText);
        return { status: 'accepted', text: f.readBuffer };
      },
      write: (bytes) => {
        ++f.calls.write;
        f.written = Buffer.from(bytes);
        return Promise.resolve('accepted');
      },
      readHtml: async () => {
        ++f.calls.readHtml;
        f.readItemBuffer = {
          ...f.readItem,
          body: Buffer.from(f.readItem.body),
          ...(f.readItem.text === undefined
            ? {}
            : { text: Buffer.from(f.readItem.text) }),
        };
        return { status: 'accepted', item: f.readItemBuffer };
      },
      writeHtml: (item) => {
        ++f.calls.writeHtml;
        f.htmlWritten = {
          ...item,
          body: Buffer.from(item.body),
          ...(item.text === undefined ? {} : { text: Buffer.from(item.text) }),
        };
        return Promise.resolve('accepted');
      },
      readImage: async () => {
        ++f.calls.readImage;
        f.readImageBuffer = {
          ...f.readImage,
          rgba: Buffer.from(f.readImage.rgba),
        };
        return { status: 'accepted', item: f.readImageBuffer };
      },
      writeImage: (item) => {
        ++f.calls.writeImage;
        f.imageWritten = {
          width: item.width,
          height: item.height,
          rgba: Buffer.from(item.rgba),
        };
        return Promise.resolve('accepted');
      },
    },
    {
      control: (type, data) => f.tasks.push(() => f.client.message(type, data)),
      chunk: (bytes) =>
        new Promise((resolve) =>
          f.tasks.push(() => {
            f.client.binary(Uint8Array.from(bytes).buffer);
            resolve();
          }),
        ),
      close: () => ++f.closed,
      changed: () => {},
    },
    () => f.time,
  );
  f.flush = async () => {
    for (let n = 0; n < 1000; ++n) {
      while (f.tasks.length) f.tasks.shift()();
      await Promise.resolve();
      if (!f.tasks.length) {
        await Promise.resolve();
        if (!f.tasks.length) return;
      }
    }
    throw new Error('Fixture work limit');
  };
  f.drive = async (promise) => {
    let result;
    promise.then((value) => {
      result = value;
    });
    for (let n = 0; n < 1100 && result === undefined; ++n) {
      f.client.service();
      f.server.service();
      await f.flush();
      if (result === undefined) f.time += 64;
    }
    assert.notEqual(result, undefined);
    return result;
  };
  f.offer();
  return f;
}
