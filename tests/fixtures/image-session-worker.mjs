// Synthetic session backend only; no RDP or OS clipboard access.
import { FakeSessionWorker } from './session-worker.mjs';
export const imageItem = () => ({
  width: 2,
  height: 1,
  rgba: Buffer.from('12345678fedcba98', 'hex'),
});
export class ImageSessionWorker extends FakeSessionWorker {
  source = {
    generation: 1n,
    revision: 1n,
    maximum: 1024,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
    image: true,
    remoteImage: true,
    localImageAccepted: false,
  };
  reads = 0;
  writes = 0;
  revokes = 0;
  returned = [];
  image = imageItem();
  written = undefined;
  onClipboard(listener) {
    this.on('clipboard', listener);
    return () => this.off('clipboard', listener);
  }
  publish(patch = {}) {
    Object.assign(this.source, patch);
    this.emit('clipboard', this.source);
  }
  async start(config, signal) {
    await super.start(config, signal);
    const c = config.clipboard;
    Object.assign(this.source, {
      maximum: c.maxItemBytes ?? 1048576,
      toServer: c.mode !== 'server-to-browser',
      fromServer: c.mode !== 'browser-to-server',
      remoteText: c.mode !== 'browser-to-server',
      remoteImage: c.mode !== 'browser-to-server',
    });
    if (c.html)
      Object.assign(this.source, {
        html: true,
        remoteHtml: this.source.fromServer,
        localHtmlAccepted: false,
      });
    this.publish();
  }
  async readClipboardImage() {
    ++this.reads;
    if (this.readGate) await this.readGate;
    const item = {
      width: this.image.width,
      height: this.image.height,
      rgba: Buffer.from(this.image.rgba),
    };
    if (this.returned.length >= 64) throw Error('Synthetic result bound');
    this.returned.push(item);
    return { status: 'accepted', item };
  }
  async writeClipboardImage(item) {
    ++this.writes;
    this.written = {
      width: item.width,
      height: item.height,
      rgba: Buffer.from(item.rgba),
    };
    this.publish({
      localAccepted: false,
      localImageAccepted: false,
      localPending: true,
      ...(this.source.html ? { localHtmlAccepted: false } : {}),
    });
    if (this.writeGate) await this.writeGate;
    this.publish({
      localPending: false,
      localAccepted: true,
      localImageAccepted: true,
    });
    return 'accepted';
  }
  async readClipboardText() {
    return { status: 'accepted', text: Buffer.from('X') };
  }
  async writeClipboardText() {
    this.publish({
      localAccepted: true,
      localImageAccepted: false,
      ...(this.source.html ? { localHtmlAccepted: false } : {}),
    });
    return 'accepted';
  }
  async readClipboardHtml() {
    return {
      status: 'accepted',
      item: {
        body: Buffer.from('<b>X</b>'),
        fragmentOffset: 0,
        fragmentBytes: 8,
        selectionOffset: 0,
        selectionBytes: 0,
        context: false,
        selection: false,
      },
    };
  }
  async writeClipboardHtml() {
    this.publish({
      localAccepted: true,
      localImageAccepted: false,
      localHtmlAccepted: true,
    });
    return 'accepted';
  }
  async revokeClipboardText() {
    ++this.revokes;
    this.written?.rgba.fill(0);
    this.publish({
      localAccepted: false,
      localImageAccepted: false,
      localPending: true,
      ...(this.source.html ? { localHtmlAccepted: false } : {}),
    });
    if (this.revokeGate) await this.revokeGate;
    this.publish({ localPending: false });
    return 'accepted';
  }
}
