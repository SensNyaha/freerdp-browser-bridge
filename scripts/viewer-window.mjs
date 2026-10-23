/** Wait for a user to finish viewing, then remove every shutdown listener. */
export function waitForViewerClose(browser, page, signals = process) {
  return new Promise((done) => {
    const stop = () => {
      browser.off('disconnected', stop);
      page.off('close', stop);
      signals.off('SIGINT', stop);
      signals.off('SIGTERM', stop);
      done();
    };
    browser.once('disconnected', stop);
    page.once('close', stop);
    signals.once('SIGINT', stop);
    signals.once('SIGTERM', stop);
    if (!browser.isConnected() || page.isClosed()) stop();
  });
}
