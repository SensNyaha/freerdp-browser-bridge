import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { Type, type Static, type TProperties } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { resolveManagedFilesPolicy } from '@freerdp-bridge/api/fastify';

const object = <T extends TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const text = (maximum: number) =>
  Type.String({ minLength: 1, maxLength: maximum });
const publicKey = object({
  kty: Type.Literal('RSA'),
  alg: Type.Literal('RS256'),
  use: Type.Literal('sig'),
  kid: text(128),
  n: Type.String({
    minLength: 342,
    maxLength: 683,
    pattern: '^[A-Za-z0-9_-]+$',
  }),
  e: Type.Literal('AQAB'),
});
export const StandaloneConfigSchema = object({
  schemaVersion: Type.Literal(1),
  listen: object({
    host: Type.Union([Type.Literal('127.0.0.1'), Type.Literal('::1')]),
    port: Type.Integer({ minimum: 1024, maximum: 65535 }),
  }),
  allowedOrigins: Type.Array(text(2048), { maxItems: 32, uniqueItems: true }),
  targets: Type.Array(
    object({
      host: Type.String({
        minLength: 1,
        maxLength: 253,
        pattern: '^[A-Za-z0-9:._-]+$',
      }),
      port: Type.Integer({ minimum: 1, maximum: 65535 }),
    }),
    { maxItems: 64, uniqueItems: true },
  ),
  limits: object({
    maxSessions: Type.Integer({ minimum: 1, maximum: 32 }),
    maxPerPrincipal: Type.Integer({ minimum: 1, maximum: 4 }),
  }),
  files: Type.Optional(
    object({
      xrdpLegacyDelete: Type.Optional(Type.Boolean()),
      maxTotalBytes: Type.Optional(
        Type.Integer({ minimum: 0, maximum: 2 ** 40 }),
      ),
      maxFileBytes: Type.Optional(
        Type.Integer({ minimum: 0, maximum: 2 ** 40 }),
      ),
      maxEntries: Type.Optional(Type.Integer({ minimum: 0, maximum: 65536 })),
      transferTimeoutMs: Type.Optional(
        Type.Integer({ minimum: 10, maximum: 600000 }),
      ),
      progressTimeoutMs: Type.Optional(
        Type.Integer({ minimum: 10, maximum: 600000 }),
      ),
      nativeTimeoutMs: Type.Optional(
        Type.Integer({ minimum: 10, maximum: 30000 }),
      ),
    }),
  ),
  auth: Type.Optional(
    object({
      issuer: text(256),
      audience: text(256),
      jwks: object({
        keys: Type.Array(publicKey, { minItems: 1, maxItems: 8 }),
      }),
    }),
  ),
});
export type StandaloneConfig = Static<typeof StandaloneConfigSchema>;
const checked = TypeCompiler.Compile(StandaloneConfigSchema);
const invalid = () => new Error('STANDALONE_CONFIG_INVALID');

export function validateStandaloneConfig(value: unknown): StandaloneConfig {
  if (!checked.Check(value)) throw invalid();
  if (value.limits.maxPerPrincipal > value.limits.maxSessions) throw invalid();
  if (value.files !== undefined) {
    try {
      resolveManagedFilesPolicy(value.files);
    } catch {
      throw invalid();
    }
  }
  if (
    value.auth &&
    new Set(value.auth.jwks.keys.map((key) => key.kid)).size !==
      value.auth.jwks.keys.length
  )
    throw invalid();
  for (const origin of value.allowedOrigins) {
    try {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        )
      )
        throw invalid();
    } catch {
      throw invalid();
    }
  }
  // Never retain mutable caller-owned key/policy objects.
  return structuredClone(value);
}

export async function readStandaloneConfig(path: string) {
  try {
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size < 2 || info.size > 65536) throw invalid();
      const bytes = Buffer.alloc(65537);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead !== info.size) throw invalid();
      return validateStandaloneConfig(
        JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')),
      );
    } finally {
      await file.close();
    }
  } catch {
    throw invalid();
  }
}
