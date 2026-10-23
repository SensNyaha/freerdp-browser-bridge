const prefix = '/repos/SensNyaha/freerdp-browser-bridge/';
export function standaloneGithubApi(token, fetcher = fetch) {
  return async (path, { method = 'GET', body, bytes } = {}) => {
    const url = new URL(
      path.startsWith('https:') ? path : 'https://api.github.com' + path,
    );
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !['api.github.com', 'uploads.github.com'].includes(url.hostname) ||
      !url.pathname.startsWith(prefix) ||
      !['GET', 'POST'].includes(method) ||
      (method !== 'GET' && !token)
    )
      throw new Error('STANDALONE_RELEASE_API_TARGET_REFUSED');
    if (
      (method === 'GET' && url.hostname !== 'api.github.com') ||
      (method === 'POST' &&
        (url.hostname !== 'uploads.github.com' ||
          !/^\/repos\/SensNyaha\/freerdp-browser-bridge\/releases\/[1-9][0-9]*\/assets$/.test(
            url.pathname,
          ) ||
          !Number.isSafeInteger(bytes) ||
          bytes < 1 ||
          bytes > 536870912))
    )
      throw new Error('STANDALONE_RELEASE_API_TARGET_REFUSED');
    const response = await fetcher(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(bytes
          ? {
              'content-type': 'application/octet-stream',
              'content-length': String(bytes),
            }
          : body
            ? { 'content-type': 'application/json' }
            : {}),
      },
      body: bytes ? body : body ? JSON.stringify(body) : undefined,
      ...(bytes ? { duplex: 'half' } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(bytes ? 180000 : 30000),
    });
    if (method === 'GET' && response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('STANDALONE_RELEASE_API_REQUEST_UNCONFIRMED');
    }
    let count = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      if ((count += chunk.length) > 2097152)
        throw new Error('STANDALONE_RELEASE_API_RESPONSE_LIMIT');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('STANDALONE_RELEASE_API_RESPONSE_INVALID');
    }
  };
}
