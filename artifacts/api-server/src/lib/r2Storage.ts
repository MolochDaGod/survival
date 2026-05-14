/**
 * R2 (Cloudflare) S3-compatible storage client.
 *
 * Wraps the AWS S3 SDK pointed at the standard R2 S3 API endpoint
 * (https://<accountId>.r2.cloudflarestorage.com), NOT the public custom
 * domain — the custom domain is for serving fetched objects, not S3 ops.
 *
 * Environment:
 *   CF_ACCOUNT_ID            – Cloudflare account ID (hex32) for the S3 endpoint
 *   OBJECT_STORAGE_KEY       – R2 access key id
 *   OBJECT_STORAGE_SECRET    – R2 secret access key
 *   OBJECT_STORAGE_REGION    – usually "auto"
 *   OBJECT_STORAGE_PUBLIC_URL      – CDN-style custom domain prefix for serving
 *   OBJECT_STORAGE_PUBLIC_R2_URL   – pub-XXXX.r2.dev fallback for serving
 *
 * Buckets (named by env):
 *   R2_BUCKET_ASSETS         – primary public/CDN bucket  (e.g. "grudge-assets")
 *   R2_BUCKET_OBJECTSTORE    – secondary, app-internal     (e.g. "objectstore-assets")
 */

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  type _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export interface R2ListEntry {
  key:           string;
  size:          number;
  etag:          string;
  lastModified:  string;
}

export interface R2HeadInfo {
  contentType:   string;
  size:          number;
  etag:          string;
  lastModified:  string;
  metadata:      Record<string, string>;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[r2Storage] required env ${name} is unset`);
  return v;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region:    process.env.OBJECT_STORAGE_REGION || 'auto',
    endpoint:  `https://${requireEnv('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     requireEnv('OBJECT_STORAGE_KEY'),
      secretAccessKey: requireEnv('OBJECT_STORAGE_SECRET'),
    },
    forcePathStyle: true,
  });
  return _client;
}

export const R2 = {
  buckets: {
    /** Primary public/CDN bucket */
    assets:      () => requireEnv('R2_BUCKET_ASSETS'),
    /** Internal/app object-store bucket */
    objectstore: () => requireEnv('R2_BUCKET_OBJECTSTORE'),
  },

  /** List objects in a bucket. Pages through everything when continuation. */
  async list(bucket: string, prefix?: string, opts?: { maxKeys?: number; continuationToken?: string }): Promise<{
    entries: R2ListEntry[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    const r = await client().send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: opts?.maxKeys ?? 1000,
      ContinuationToken: opts?.continuationToken,
    }));
    const entries: R2ListEntry[] = (r.Contents ?? []).map((o: _Object) => ({
      key:          o.Key!,
      size:         o.Size ?? 0,
      etag:         (o.ETag ?? '').replace(/"/g, ''),
      lastModified: o.LastModified?.toISOString() ?? '',
    }));
    return {
      entries,
      nextToken: r.NextContinuationToken,
      isTruncated: !!r.IsTruncated,
    };
  },

  /** List ALL keys in a bucket under prefix (paginates internally). Cap is a safety net. */
  async listAll(bucket: string, prefix?: string, cap = 50_000): Promise<R2ListEntry[]> {
    const out: R2ListEntry[] = [];
    let token: string | undefined;
    do {
      const page = await R2.list(bucket, prefix, { maxKeys: 1000, continuationToken: token });
      out.push(...page.entries);
      token = page.nextToken;
      if (out.length >= cap) break;
    } while (token);
    return out.slice(0, cap);
  },

  /** HEAD for content-type, size, etag, custom metadata. */
  async head(bucket: string, key: string): Promise<R2HeadInfo | null> {
    try {
      const r = await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        contentType:  r.ContentType  ?? 'application/octet-stream',
        size:         r.ContentLength ?? 0,
        etag:         (r.ETag ?? '').replace(/"/g, ''),
        lastModified: r.LastModified?.toISOString() ?? '',
        metadata:     r.Metadata ?? {},
      };
    } catch (e: any) {
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },

  /** Get the raw object body as a Node Readable stream (for piping). */
  async getStream(bucket: string, key: string): Promise<{ stream: Readable; contentType: string; size: number } | null> {
    try {
      const r = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!r.Body) return null;
      return {
        stream:      r.Body as Readable,
        contentType: r.ContentType ?? 'application/octet-stream',
        size:        r.ContentLength ?? 0,
      };
    } catch (e: any) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },

  /** Upload a buffer/string. Use for small payloads only — for big uploads use putStream or presignPut. */
  async put(bucket: string, key: string, body: Buffer | string, contentType?: string, metadata?: Record<string, string>): Promise<{ etag: string }> {
    const r = await client().send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        body,
      ContentType: contentType ?? 'application/octet-stream',
      Metadata:    metadata,
    }));
    return { etag: (r.ETag ?? '').replace(/"/g, '') };
  },

  /**
   * Stream-based upload using the SDK's multipart Upload manager. Suitable for
   * arbitrarily large files — chunks are buffered (default 5 MB) and uploaded
   * in parallel without ever materializing the whole body in memory.
   */
  async putStream(bucket: string, key: string, body: Readable, contentType?: string, metadata?: Record<string, string>): Promise<{ etag: string }> {
    const uploader = new Upload({
      client: client(),
      params: {
        Bucket:      bucket,
        Key:         key,
        Body:        body,
        ContentType: contentType ?? 'application/octet-stream',
        Metadata:    metadata,
      },
      queueSize:    4,                // up to 4 concurrent part uploads
      partSize:     5 * 1024 * 1024,  // 5 MB minimum part size for S3 multipart
      leavePartsOnError: false,
    });
    const r = await uploader.done();
    return { etag: ((r as { ETag?: string }).ETag ?? '').replace(/"/g, '') };
  },

  /**
   * Server-side copy within R2 (e.g. for renames or deduplication).
   * The SDK URL-encodes CopySource on its own, so we pass the raw `bucket/key`
   * without leading slash and without manual encoding.
   */
  async copy(srcBucket: string, srcKey: string, dstBucket: string, dstKey: string): Promise<{ etag: string }> {
    const r = await client().send(new CopyObjectCommand({
      Bucket:     dstBucket,
      Key:        dstKey,
      CopySource: `${srcBucket}/${srcKey}`,
    }));
    return { etag: (r.CopyObjectResult?.ETag ?? '').replace(/"/g, '') };
  },

  async delete(bucket: string, key: string): Promise<void> {
    await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  /** Issue a presigned PUT URL the client can upload directly to. */
  async presignPut(bucket: string, key: string, contentType?: string, ttlSeconds = 600): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      ContentType: contentType,
    });
    return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
  },

  /** Issue a presigned GET URL for a private object. */
  async presignGet(bucket: string, key: string, ttlSeconds = 300): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
  },

  /**
   * Build a public URL for a key. Prefers OBJECT_STORAGE_PUBLIC_URL (custom domain),
   * falls back to OBJECT_STORAGE_PUBLIC_R2_URL (pub-XXXX.r2.dev).
   * Returns null if neither is set (caller should presign instead).
   */
  publicUrlFor(key: string): string | null {
    const base = process.env.OBJECT_STORAGE_PUBLIC_URL || process.env.OBJECT_STORAGE_PUBLIC_R2_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  },
};
