import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  imageReference,
  imageInspection,
  imageConfig,
  imageInventory,
} from '../../scripts/image-sbom-model.mjs';

const hash = (value) =>
  'sha256:' + createHash('sha256').update(value).digest('hex');
const fixture = () => {
  const layers = ['sha256:' + 'a'.repeat(64)];
  const configBytes = Buffer.from(
    JSON.stringify({
      architecture: 'amd64',
      os: 'linux',
      rootfs: { diff_ids: layers },
    }),
  );
  const configId = hash(configBytes);
  const manifest = Buffer.from(
    JSON.stringify({ config: { digest: configId } }),
  );
  const manifestId = hash(manifest);
  const index = Buffer.from(
    JSON.stringify({
      manifests: [
        {
          digest: manifestId,
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ],
    }),
  );
  const imageId = hash(index);
  const blobs = new Map([
    [imageId, index],
    [manifestId, manifest],
    [configId, configBytes],
  ]);
  const inspected = {
    Id: imageId,
    Os: 'linux',
    Architecture: 'amd64',
    Size: 100,
    RootFS: { Layers: layers },
  };
  const source = {
    source: {
      type: 'image',
      version: imageId,
      metadata: { imageID: configId },
    },
    distro: { id: 'debian' },
    artifacts: [
      { name: 'node', version: '24.21.0', type: 'binary' },
      { name: 'libc6', type: 'deb' },
    ],
  };
  return { blobs, imageId, configId, inspected, source };
};

test('image SBOM binds OCI index through hashed manifest/config to ordered runtime layers', async () => {
  const f = fixture();
  const inspected = imageInspection([f.inspected]);
  const config = await imageConfig(f.imageId, async (id) => f.blobs.get(id));
  assert.equal(config.digest, f.configId);
  assert.deepEqual(imageInventory(inspected, config, f.source), {
    deb: 1,
    npm: 0,
    binary: 1,
  });
  assert.equal(
    (await imageConfig(f.configId, async (id) => f.blobs.get(id))).digest,
    f.configId,
  );
});

test('image SBOM refuses registry references, wrong platform, excessive size and malformed digests', () => {
  assert.equal(
    imageReference('freerdp-bridge-service:fixture'),
    'freerdp-bridge-service:fixture',
  );
  for (const value of [
    'registry.invalid/image',
    'freerdp-bridge-service:fixture --upload',
    '../image',
    undefined,
  ])
    assert.throws(() => imageReference(value), {
      message: 'SBOM_IMAGE_ARGUMENT',
    });
  const f = fixture();
  for (const change of [
    { Id: 'sha256:bad' },
    { Os: 'windows' },
    { Architecture: 'arm64' },
    { Size: 256 * 1024 * 1024 + 1 },
    { RootFS: { Layers: ['bad'] } },
  ])
    assert.throws(() => imageInspection([{ ...f.inspected, ...change }]), {
      message: 'SBOM_IMAGE_IDENTITY',
    });
});

test('image SBOM refuses changed blobs, missing targets and excessive descriptor depth', async () => {
  const f = fixture();
  await assert.rejects(
    imageConfig(f.imageId, async () => Buffer.from('{}')),
    { message: 'SBOM_IMAGE_INVENTORY' },
  );
  await assert.rejects(
    imageConfig(f.imageId, async () => undefined),
    { message: 'SBOM_IMAGE_INVENTORY' },
  );
  const wrong = Buffer.from(
    JSON.stringify({
      manifests: [
        {
          digest: f.configId,
          platform: { os: 'linux', architecture: 'arm64' },
        },
      ],
    }),
  );
  await assert.rejects(
    imageConfig(hash(wrong), async () => wrong),
    { message: 'SBOM_IMAGE_INVENTORY' },
  );
  const excessive = Buffer.alloc(65537, 32);
  await assert.rejects(
    imageConfig(hash(excessive), async () => excessive),
    { message: 'SBOM_IMAGE_INVENTORY' },
  );
  let next = f.configId;
  for (let i = 0; i < 5; ++i) {
    const bytes = Buffer.from(JSON.stringify({ config: { digest: next } }));
    next = hash(bytes);
    f.blobs.set(next, bytes);
  }
  await assert.rejects(
    imageConfig(next, async (id) => f.blobs.get(id)),
    {
      message: 'SBOM_IMAGE_INVENTORY',
    },
  );
});

test('image SBOM refuses mismatched source ID, filesystem layers, Node distribution or OS inventory', async () => {
  const f = fixture();
  const config = await imageConfig(f.imageId, async (id) => f.blobs.get(id));
  for (const change of [
    { source: { ...f.source.source, version: 'sha256:' + 'b'.repeat(64) } },
    { source: { ...f.source.source, metadata: { imageID: f.imageId } } },
    { distro: { id: 'unrelated' } },
    {
      artifacts: [
        { name: 'node', version: '22.0.0', type: 'binary' },
        { type: 'deb' },
      ],
    },
    { artifacts: [{ name: 'node', version: '24.21.0', type: 'binary' }] },
  ])
    assert.throws(
      () => imageInventory(f.inspected, config, { ...f.source, ...change }),
      { message: 'SBOM_IMAGE_INVENTORY' },
    );
  assert.throws(
    () =>
      imageInventory(
        { ...f.inspected, RootFS: { Layers: [] } },
        config,
        f.source,
      ),
    { message: 'SBOM_IMAGE_INVENTORY' },
  );
});
