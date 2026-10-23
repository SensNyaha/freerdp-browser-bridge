export const appearanceFields = Object.freeze([
  'wallpaper',
  'fontSmoothing',
  'desktopComposition',
  'fullWindowDrag',
  'menuAnimations',
  'themes',
]);

export function connectionConfig(fields, capabilities) {
  const invalid = () => {
    throw new Error('Проверьте параметры подключения');
  };
  const text = (name, limit) => {
    const value = fields.get(name) ?? '';
    if (
      typeof value !== 'string' ||
      value.length > limit ||
      /[\u0000-\u001f]/.test(value)
    )
      invalid();
    return value;
  };
  const number = (name, min, max, even = false) => {
    const value = Number(text(name, 8));
    if (
      !Number.isInteger(value) ||
      value < min ||
      value > max ||
      (even && value % 2)
    )
      invalid();
    return value;
  };
  const choice = (name, values) => {
    const value = text(name, 32);
    if (!values.includes(value)) invalid();
    return value;
  };
  const host = text('host', 253).trim();
  if (!host || /\s/.test(host)) invalid();
  const password = text('password', 1024);
  if (new TextEncoder().encode(password).length > 4096) invalid();
  const videoCodec = choice('video', ['h264', 'jpeg']);
  const audioOutput = choice('audio', ['off', 'pcm', 'opus']);
  const microphone = choice('microphone', ['off', 'pcm', 'opus']);
  const clipboardMode = fields.get('clipboard') ?? 'off';
  if (
    ![
      'off',
      'bidirectional',
      'server-to-browser',
      'browser-to-server',
    ].includes(clipboardMode)
  )
    invalid();
  if (
    clipboardMode !== 'off' &&
    (!capabilities?.clipboardText || !capabilities?.clipboardRevoke)
  )
    throw new Error('Выбранная функция не поддерживается этим bridge');
  const dynamicResolution = fields.get('dynamicResolution') === 'on';
  const touch = fields.get('touch') === 'on';
  const buffer = number('audioBuffer', 120, 200);
  if (
    ![120, 200].includes(buffer) ||
    !capabilities?.connectCore ||
    !(videoCodec === 'h264'
      ? capabilities.h264Capture
      : capabilities.jpegCapture) ||
    (dynamicResolution && !capabilities.displayControl) ||
    (touch && !capabilities.touchInput) ||
    (audioOutput !== 'off' &&
      !(audioOutput === 'pcm'
        ? capabilities.pcmOutput
        : capabilities.opusOutput)) ||
    (audioOutput !== 'off' && buffer === 200 && !capabilities.audioBuffer200) ||
    (microphone !== 'off' &&
      (!capabilities.microphoneReset ||
        !(microphone === 'pcm'
          ? capabilities.pcmInput
          : capabilities.opusInput)))
  )
    throw new Error('Выбранная функция не поддерживается этим bridge');
  const appearance = {};
  for (const name of appearanceFields) {
    const value = choice(name, ['', 'true', 'false']);
    if (value === '') continue;
    if (!capabilities?.performanceSettings)
      throw new Error('Выбранная функция не поддерживается этим bridge');
    appearance[name] = value === 'true';
  }
  const preferIPv6 = choice('preferIPv6', ['', 'true', 'false']);
  const forceIpVersion = choice('forceIpVersion', ['', '4', '6']);
  if ((preferIPv6 !== '' || forceIpVersion !== '') && !capabilities?.ipSettings)
    throw new Error('Выбранная функция не поддерживается этим bridge');
  const config = {
    target: {
      host,
      port: number('port', 1, 65535),
      ...(preferIPv6 === '' ? {} : { preferIPv6: preferIPv6 === 'true' }),
      ...(forceIpVersion === ''
        ? {}
        : { forceIpVersion: Number(forceIpVersion) }),
    },
    auth: {
      username: text('username', 256),
      domain: text('domain', 256),
      password,
    },
    security: {
      protocol: choice('security', ['auto', 'nla', 'tls']),
      minimumTls: choice('minimumTls', ['1.2', '1.3']),
      certificatePolicy: choice('certificatePolicy', ['strict', 'prompt']),
    },
    display: {
      width: number('width', 200, 3840, true),
      height: number('height', 200, 2160, true),
      dynamicResolution,
    },
    quality: {
      profile: choice('quality', [
        'low-bandwidth',
        'balanced',
        'lan',
        'custom',
      ]),
      maxFps: number('fps', 1, videoCodec === 'jpeg' ? 20 : 30),
      ...appearance,
    },
    input: { touch },
    ...(clipboardMode === 'off'
      ? {}
      : {
          clipboard: {
            mode: clipboardMode,
            text: true,
            maxItemBytes: number('clipboardMax', 1, 16777216),
          },
        }),
    media: {
      audioOutput,
      microphone,
      ...(audioOutput !== 'off' ? { audioOutputBufferMs: buffer } : {}),
    },
    timeouts: { connectMs: number('connectMs', 1000, 120000), tcpAckMs: 10000 },
  };
  return { config, viewer: { codecs: [videoCodec], audioOutput, microphone } };
}
