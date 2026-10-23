import type { DisplayState } from '@freerdp-bridge/protocol';

/** Decimal strings preserve native u64 epochs in JSON. Scale describes the supported layout. */
export function displayData(state: DisplayState, resizing = false) {
  return {
    generation: state.generation.toString(),
    framebufferRevision: state.framebufferRevision.toString(),
    width: state.width,
    height: state.height,
    dynamicResolution: state.dynamicResolution,
    negotiated: state.negotiated,
    maxWidth: state.maxWidth,
    maxHeight: state.maxHeight,
    maxArea: state.maxArea,
    pixelFormat: 'BGRA8',
    desktopScale: 100,
    deviceScale: 100,
    orientation: 0,
    resizing,
  };
}
