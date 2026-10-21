import { setTimeout as delay } from 'node:timers/promises';
import {
  ViewerSoak,
  soakDurationMs,
  soakIntervalMs,
  windowsWorkerResidentBytes,
  mediaCredit,
} from './viewer-soak.mjs';
import { readViewerAudioObservation } from './viewer-audio-observation.mjs';

// Existing epoch/config recovery can transiently report waiting. Observe its
// bounded recovery; the full elapsed interval still counts toward sample loss.
export async function readMvpAudioReady(
  page,
  {
    read = readViewerAudioObservation,
    now = () => performance.now(),
    pause = delay,
  } = {},
) {
  const deadline = now() + 3000;
  for (;;) {
    const audio = await read(page);
    if (now() >= deadline || !audio.source?.enabled)
      throw new Error('LAB_MVP_AUDIO_RECOVERY_FAILED');
    if (audio.source.availability === 'ready') return audio;
    await pause(100);
  }
}

// One prepared, disposable Notepad document. No application launch or arbitrary
// content readback; only the already verified synthetic document is copied.
export async function runMvpBrowserSoak({
  page,
  backend,
  workerPath,
  metrics,
  exerciseDocument,
}) {
  const collector = new ViewerSoak();
  const started = performance.now();
  let initialAudio, previousAudio, latestAudio;
  for (;;) {
    await exerciseDocument();
    latestAudio = await readMvpAudioReady(page);
    const elapsedMs = Math.floor(performance.now() - started);
    const view = await page.evaluate(() => window.bridgeViewer.stats);
    collector.observe(
      elapsedMs,
      view,
      await windowsWorkerResidentBytes(backend.pid, workerPath),
      process.memoryUsage().rss,
      mediaCredit(await metrics(), 'h264'),
    );
    if (
      latestAudio.codec !== 'opus' ||
      !latestAudio.source?.enabled ||
      latestAudio.source.availability !== 'ready' ||
      latestAudio.worklet.invalidCalls !== 0 ||
      latestAudio.worklet.queuedFrames > 5760 ||
      latestAudio.worklet.highWaterFrames > 5760 ||
      (previousAudio &&
        latestAudio.worklet.playedFrames <= previousAudio.worklet.playedFrames)
    )
      throw new Error('LAB_MVP_AUDIO_PROGRESS_FAILED');
    initialAudio ??= latestAudio;
    previousAudio = latestAudio;
    console.log(
      JSON.stringify({
        type: 'lab.mvp-soak.progress',
        ...collector.snapshot(),
        audio: latestAudio,
      }),
    );
    if (elapsedMs >= soakDurationMs) break;
    await delay(Math.min(soakIntervalMs, soakDurationMs - elapsedMs));
  }
  const video = collector.snapshot();
  const renderedSeconds =
    (latestAudio.worklet.playedFrames - initialAudio.worklet.playedFrames) /
    48000;
  if (
    !video.workerMemoryBudgetPassed ||
    renderedSeconds < 0.95 * (video.elapsedMs / 1000)
  )
    throw new Error('LAB_MVP_SOAK_BUDGET_FAILED');
  return {
    video,
    renderedSeconds,
    initialAudio,
    finalAudio: latestAudio,
    underflowFrames:
      latestAudio.worklet.underflowFrames -
      initialAudio.worklet.underflowFrames,
    overflowSkippedFrames:
      latestAudio.worklet.overflowSkippedFrames -
      initialAudio.worklet.overflowSkippedFrames,
    configurations:
      latestAudio.worklet.configurations - initialAudio.worklet.configurations,
    audibleAcceptance: false,
  };
}
