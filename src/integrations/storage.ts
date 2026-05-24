import path from 'path'
import fs from 'fs'
import { env } from '../config/env'

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<string>
  delete(url: string): Promise<void>
}

class GCSProvider implements StorageProvider {
  private bucketName: string

  constructor() {
    this.bucketName = env.GCS_BUCKET || 'teesa-uploads'
  }

  async upload(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const { Storage } = await import('@google-cloud/storage')
    const storage = new Storage({
      projectId: env.GCP_PROJECT_ID,
      keyFilename: env.GCP_KEY_FILE,
    })
    const bucket = storage.bucket(this.bucketName)
    const file = bucket.file(`uploads/${Date.now()}-${filename}`)
    await file.save(buffer, { metadata: { contentType: mimeType } })
    await file.makePublic()
    return `https://storage.googleapis.com/${this.bucketName}/${file.name}`
  }

  async delete(url: string): Promise<void> {
    const { Storage } = await import('@google-cloud/storage')
    const storage = new Storage({ projectId: env.GCP_PROJECT_ID, keyFilename: env.GCP_KEY_FILE })
    const name = url.split(`${this.bucketName}/`)[1]
    if (name) {
      await storage.bucket(this.bucketName).file(name).delete()
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
  if (env.GCS_BUCKET && env.GCP_PROJECT_ID && env.GCP_KEY_FILE) {
    return new GCSProvider()
  }
  return new LocalStorageProvider()
}
