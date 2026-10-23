// Lab-only bootstrap over inherited stdin. Never place credentials in argv/env.
export async function readPrivateLabInput(input) {
  const storage = Buffer.alloc(8192);
  let length = 0;
  try {
    for await (const chunk of input) {
      if (!Buffer.isBuffer(chunk)) throw new Error();
      try {
        if (chunk.length > storage.length - length) throw new Error();
        chunk.copy(storage, length);
        length += chunk.length;
      } finally {
        chunk.fill(0);
      }
    }
    const value = JSON.parse(storage.subarray(0, length).toString('utf8'));
    if (
      !value ||
      Array.isArray(value) ||
      typeof value.host !== 'string' ||
      !value.host.length ||
      value.host.length > 256 ||
      typeof value.username !== 'string' ||
      value.username.length > 256 ||
      typeof value.password !== 'string' ||
      value.password.length > 4096 ||
      !Number.isInteger(value.port ?? 3389) ||
      (value.port ?? 3389) < 1 ||
      (value.port ?? 3389) > 65535
    )
      throw new Error();
    return {
      host: value.host,
      port: value.port ?? 3389,
      username: value.username,
      password: value.password,
    };
  } catch {
    throw new Error('Invalid private lab input');
  } finally {
    storage.fill(0);
  }
}
