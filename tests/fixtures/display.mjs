export const display = (overrides = {}) => ({
  generation: 1n,
  framebufferRevision: 1n,
  width: 640,
  height: 480,
  dynamicResolution: true,
  negotiated: true,
  maxWidth: 3840,
  maxHeight: 2160,
  maxArea: 8294400,
  ...overrides,
});
