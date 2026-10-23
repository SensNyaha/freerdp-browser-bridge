/** One fresh bounded Worklet query; project only the local viewer's scalar evidence. */
export async function readViewerAudioObservation(page) {
  if (!(await page.evaluate(() => window.bridgeViewer?.requestAudioStats())))
    throw new Error('LAB_AUDIO_STATS_UNAVAILABLE');
  await page.waitForFunction(
    () => {
      const audio = window.bridgeViewer?.stats.audio;
      return audio?.remote && !audio.inFlight;
    },
    undefined,
    { timeout: 3000 },
  );
  return page.evaluate(() => {
    const stats = window.bridgeViewer.stats;
    const audio = stats.audio;
    const source = audio.source;
    const remote = audio.remote;
    return {
      codec: audio.codec,
      video: { frames: stats.frames, width: stats.width, height: stats.height },
      source: source
        ? {
            enabled: source.enabled,
            availability: source.availability,
            revision: source.revision,
            epoch: source.epoch,
            awaitingConfig: source.awaitingConfig,
          }
        : null,
      records: audio.records,
      decoded: audio.decoded ?? null,
      worklet: {
        configurations: remote.configurations,
        packets: remote.packets,
        playedFrames: remote.playedFrames,
        underflowFrames: remote.underflowFrames,
        underflows: remote.underflows,
        bufferingSilenceFrames: remote.bufferingSilenceFrames,
        overflowSkippedFrames: remote.overflowSkippedFrames,
        resetDiscardedFrames: remote.resetDiscardedFrames,
        invalidCalls: remote.invalidCalls,
        highWaterFrames: remote.highWaterFrames,
        queuedFrames: remote.queuedFrames,
        buffering: remote.buffering,
      },
    };
  });
}
