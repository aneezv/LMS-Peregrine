import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'
import { Readable } from 'node:stream'

const SAFE_KEY_FILENAME = /^[a-zA-Z0-9._-]+\.json$/

function loadServiceAccountCredentials(): Record<string, unknown> {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (inline) {
    try {
      const parsed = JSON.parse(inline) as Record<string, unknown>
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error(
          'GOOGLE_SERVICE_ACCOUNT_JSON is missing required keys (client_email/private_key).',
        )
      }
      return parsed
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Invalid JSON'
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON is invalid. Ensure it is one-line JSON with escaped newlines in private_key (\\n). Detail: ${detail}`,
      )
    }
  }
  // Basename only, file must live in /credentials (avoids bundler tracing the whole repo)
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim()
  if (keyFile) {
    if (!SAFE_KEY_FILENAME.test(keyFile)) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be a simple name like my-key.json (under credentials/).',
      )
    }
    const resolved = path.join(process.cwd(), 'credentials', keyFile)
    try {
      const file = fs.readFileSync(resolved, 'utf8')
      const parsed = JSON.parse(file) as Record<string, unknown>
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('service-account JSON missing client_email/private_key.')
      }
      return parsed
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Read/parse error'
      throw new Error(
        `Could not read GOOGLE_SERVICE_ACCOUNT_KEY_FILE from credentials/${keyFile}. Detail: ${detail}`,
      )
    }
  }
  throw new Error(
    'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_SERVICE_ACCOUNT_KEY_FILE (filename under credentials/).',
  )
}

/** Full Drive scope — needed for Shared drives (Team drives); service accounts have no “My Drive” quota. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

function sharedDriveHelp(folderName: string, folderEnvVar: string): string {
  return `Service accounts have no personal Drive storage. Use a Shared drive: create one in Google Drive, add your service account as a member (Content manager or Manager), create a "${folderName}" folder inside that Shared drive, copy its folder ID into ${folderEnvVar}. See https://developers.google.com/drive/api/guides/about-shareddrives`
}

function isStorageQuotaError(e: unknown): boolean {
  const s = JSON.stringify(e)
  return (
    /storage quota|storageQuotaExceeded|does not have storage quota/i.test(s) ||
    /Service Accounts do not have storage quota/i.test(s)
  )
}

function isPermissionOrFolderError(e: unknown): boolean {
  const s = JSON.stringify(e)
  return (
    /insufficient permissions|insufficientpermission|forbidden|permission denied/i.test(s) ||
    /file not found|notFound|404/i.test(s)
  )
}

async function uploadFileToDriveFolder(params: {
  buffer: Buffer
  fileName: string
  mimeType: string
  folderIdEnvVar: 'GOOGLE_DRIVE_ASSIGNMENTS_FOLDER_ID' | 'GOOGLE_DRIVE_THUMBNAILS_FOLDER_ID'
  folderNameForError: string
}): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = process.env[params.folderIdEnvVar]
  if (!folderId?.trim()) {
    throw new Error(`${params.folderIdEnvVar} is not set.`)
  }

  const credentials = loadServiceAccountCredentials()
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  })

  const drive = google.drive({ version: 'v3', auth })
  const stream = Readable.from(params.buffer)

  try {
    const created = await drive.files.create({
      requestBody: {
        name: params.fileName,
        parents: [folderId],
      },
      media: {
        mimeType: params.mimeType || 'application/pdf',
        body: stream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })

    const fileId = created.data.id
    if (!fileId) {
      throw new Error('Drive did not return a file id')
    }

    let webViewLink = created.data.webViewLink
    if (!webViewLink) {
      const meta = await drive.files.get({
        fileId,
        fields: 'webViewLink',
        supportsAllDrives: true,
      })
      webViewLink = meta.data.webViewLink ?? undefined
    }

    return {
      fileId,
      webViewLink: webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    }
  } catch (e) {
    if (isStorageQuotaError(e)) {
      throw new Error(sharedDriveHelp(params.folderNameForError, params.folderIdEnvVar))
    }
    if (isPermissionOrFolderError(e)) {
      throw new Error(
        `Google Drive folder is not accessible by the service account. Verify ${params.folderIdEnvVar} points to a folder in a Shared drive, and add the service account as Content manager/Manager.`,
      )
    }
    throw e
  }
}

/**
 * Uploads a file into a folder that must live on a Shared drive (Team drive).
 * My Drive folders will fail with a storage quota error for service accounts.
 */
export async function uploadAssignmentToDrive(params: {
  buffer: Buffer
  fileName: string
  mimeType: string
}): Promise<{ fileId: string; webViewLink: string }> {
  return uploadFileToDriveFolder({
    ...params,
    folderIdEnvVar: 'GOOGLE_DRIVE_ASSIGNMENTS_FOLDER_ID',
    folderNameForError: 'Assignments',
  })
}

export async function uploadCourseThumbnailToDrive(params: {
  buffer: Buffer
  fileName: string
  mimeType: string
}): Promise<{ fileId: string; webViewLink: string }> {
  return uploadFileToDriveFolder({
    ...params,
    folderIdEnvVar: 'GOOGLE_DRIVE_THUMBNAILS_FOLDER_ID',
    folderNameForError: 'Thumbnails',
  })
}

export async function deleteFileFromDrive(driveFileId: string): Promise<void> {
  if (!driveFileId?.trim()) return
  const credentials = loadServiceAccountCredentials()
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  })
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({
    fileId: driveFileId,
    supportsAllDrives: true,
  })
}
