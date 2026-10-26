// Synthetic session backend only; no RDP, host clipboard or HTML execution.
import { FakeSessionWorker } from './session-worker.mjs';
export class HtmlSessionWorker extends FakeSessionWorker {
  source = {
    generation: 1n,
    revision: 1n,
    maximum: 1048576,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
    html: true,
    remoteHtml: true,
    localHtmlAccepted: false,
  };
  htmlBody = Buffer.from('<p><b>synthetic \u0416\ud83d\ude00</b></p>');
  plain = Buffer.from('synthetic \u0416\ud83d\ude00');
  reads = 0;
  writes = 0;
  revokes = 0;
  returned = [];
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
    this.source.maximum = config.clipboard.maxItemBytes ?? 1048576;
    this.source.toServer = config.clipboard.mode !== 'server-to-browser';
    this.source.fromServer = config.clipboard.mode !== 'browser-to-server';
    this.source.remoteText = this.source.remoteHtml = this.source.fromServer;
    this.publish();
  }
  async readClipboardHtml() {
    ++this.reads;
    if (this.readGate) await this.readGate;
    const item = {
      body: Buffer.from(this.htmlBody),
      fragmentOffset: 0,
      fragmentBytes: this.htmlBody.length,
      selectionOffset: 0,
      selectionBytes: 0,
      context: false,
      selection: false,
      text: Buffer.from(this.plain),
    };
    if (this.returned.length >= 64) throw Error('Synthetic result trace bound');
    this.returned.push(item);
    return { status: 'accepted', item };
  }
  async readClipboardText() {
    return { status: 'accepted', text: Buffer.from(this.plain) };
  }
  async writeClipboardHtml(item) {
    ++this.writes;
    this.written = {
      ...item,
      body: Buffer.from(item.body),
      ...(item.text ? { text: Buffer.from(item.text) } : {}),
    };
    this.publish({
      localAccepted: false,
      localHtmlAccepted: false,
      localPending: true,
    });
    if (this.writeGate) await this.writeGate;
    this.publish({
      localPending: false,
      localAccepted: true,
      localHtmlAccepted: true,
    });
    return 'accepted';
  }
  async writeClipboardText() {
    this.publish({ localAccepted: true, localHtmlAccepted: false });
    return 'accepted';
  }
  async revokeClipboardText() {
    ++this.revokes;
    this.written?.body.fill(0);
    this.written?.text?.fill(0);
    this.publish({
      localAccepted: false,
      localHtmlAccepted: false,
      localPending: true,
    });
    if (this.revokeGate) await this.revokeGate;
    this.publish({ localPending: false });
    return 'accepted';
  }
}
