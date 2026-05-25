import path from 'path'
import fs from 'fs'
import { env } from '../config/env'

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<string>
  delete(url: string): Promise<void>
}

// Railway Object Storage is S3-compatible.
// Add an Object Storage service in your Railway project and it injects:
//   RAILWAY_OBJECT_STORAGE_ENDPOINT, RAILWAY_OBJECT_STORAGE_ACCESS_KEY_ID,
//   RAILWAY_OBJECT_STORAGE_SECRET_ACCESS_KEY, RAILWAY_OBJECT_STORAGE_BUCKET_NAME
class RailwayStorageProvider implements StorageProvider {
  private client: import('@aws-sdk/client-s3').S3Client | null = null

  private getClient() {
    if (this.client) return this.client
    // Lazy import so the package is only loaded when storage is actually used
    const { S3Client } = require('@aws-sdk/client-s3')
    this.client = new S3Client({
      endpoint: env.RAILWAY_OBJECT_STORAGE_ENDPOINT!,
      region: 'auto',
      credentials: {
        accessKeyId: env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: env.RAILWAY_OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    })
    return this.client!
  }

  async upload(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const { PutObjectCommand } = require('@aws-sdk/client-s3')
    const bucket = env.RAILWAY_OBJECT_STORAGE_BUCKET_NAME!
    const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await this.getClient().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Makes the object publicly readable
      ACL: 'public-read',
    }))
    // Railway Object Storage public URL format
    return `${env.RAILWAY_OBJECT_STORAGE_ENDPOINT!.replace(/\/$/, '')}/${bucket}/${key}`
  }

  async delete(url: string): Promise<void> {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
    const bucket = env.RAILWAY_OBJECT_STORAGE_BUCKET_NAME!
    // Extract key from URL: everything after /{bucket}/
    const key = url.split(`/${bucket}/`)[1]
    if (key) {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    }
  }
}

class LocalStorageProvider implements StorageProvider {
  private uploadsDir: string

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true })
    }
  }

  async upload(buffer: Buffer, filename: string, _mimeType: string): Promise<string> {
    const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const filePath = path.join(this.uploadsDir, safeName)
    fs.writeFileSync(filePath, buffer)
    return `/uploads/${safeName}`
  }

  async delete(url: string): Promise<void> {
    const filename = url.replace('/uploads/', '')
    const filePath = path.join(this.uploadsDir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
}

export function getStorageProvider(): StorageProvider {
  if (
    env.RAILWAY_OBJECT_STORAGE_ENDPOINT &&
    env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY_ID &&
    env.RAILWAY_OBJECT_STORAGE_SECRET_ACCESS_KEY &&
    env.RAILWAY_OBJECT_STORAGE_BUCKET_NAME
  ) {
    return new RailwayStorageProvider()
  }
  return new LocalStorageProvider()
}
