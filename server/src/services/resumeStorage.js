import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let client;

const getConfig = () => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;

  if (!client) {
    const credentials = process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined;
    client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials,
    });
  }

  return { bucket, client };
};

export const saveResume = async (file, userId) => {
  const config = getConfig();
  if (!config) {
    return {
      storageKey: '',
      data: file.buffer,
      contentType: file.mimetype,
      storedInDatabase: true,
    };
  }

  const extension = file.mimetype === 'application/pdf' ? '.pdf' : '.docx';
  const key = `resumes/${userId}/${randomUUID()}${extension}`;
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentLength: file.size,
    ContentType: file.mimetype,
    CacheControl: 'private, no-store',
  }));
  return {
    storageKey: key,
    data: undefined,
    contentType: file.mimetype,
    storedInDatabase: false,
  };
};

export const getStoredResume = async (key) => {
  const config = getConfig();
  if (!config) throw new Error('Resume object storage is not configured.');

  try {
    const response = await config.client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
};

export const deleteResume = async (key) => {
  const config = getConfig();
  if (!config || !key) return;
  await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
};