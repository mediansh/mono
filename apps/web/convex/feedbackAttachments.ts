import type { Experimental_DownloadFunction } from "ai"
import { v } from "convex/values"

export const MAX_IMAGE_ATTACHMENTS_PER_FEEDBACK_ITEM = 10
export const MAX_AI_IMAGE_ATTACHMENTS_PER_PROMPT = 20
const MAX_IMAGE_DOWNLOAD_BYTES = 10 * 1024 * 1024

export const feedbackImageAttachmentValidator = v.object({
  url: v.string(),
  name: v.optional(v.string()),
  mediaType: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
})

export type FeedbackImageAttachment = {
  url: string
  name?: string
  mediaType?: string
  width?: number
  height?: number
}

type FeedbackPromptPart =
  | {
      type: "text"
      text: string
    }
  | {
      type: "image"
      image: URL
      mediaType?: string
    }

type FeedbackPromptItem = {
  imageAttachments?: FeedbackImageAttachment[]
}

function normalizeMediaType(mediaType: string | null | undefined) {
  return mediaType?.split(";")[0]?.trim().toLowerCase() || undefined
}

export function isImageMediaType(mediaType: string | null | undefined) {
  return normalizeMediaType(mediaType)?.startsWith("image/") ?? false
}

function parseHttpUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function getAttachmentDimensions(attachment: FeedbackImageAttachment) {
  if (!attachment.width || !attachment.height) {
    return null
  }
  return `${attachment.width}x${attachment.height}`
}

function formatAttachmentDetails(attachment: FeedbackImageAttachment) {
  return [
    attachment.name ? `name=${attachment.name}` : null,
    attachment.mediaType ? `type=${attachment.mediaType}` : null,
    getAttachmentDimensions(attachment)
      ? `dimensions=${getAttachmentDimensions(attachment)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ")
}

export function normalizeImageAttachments(
  attachments: Array<{
    url?: string | null
    name?: string | null
    mediaType?: string | null
    width?: number | null
    height?: number | null
  }>
) {
  const normalized: FeedbackImageAttachment[] = []
  const seenUrls = new Set<string>()

  for (const attachment of attachments) {
    const url = attachment.url?.trim()
    if (!url || seenUrls.has(url) || !parseHttpUrl(url)) {
      continue
    }

    const mediaType = normalizeMediaType(attachment.mediaType)
    if (mediaType && !isImageMediaType(mediaType)) {
      continue
    }

    normalized.push({
      url,
      name: attachment.name?.trim() || undefined,
      mediaType,
      width: attachment.width ?? undefined,
      height: attachment.height ?? undefined,
    })
    seenUrls.add(url)

    if (normalized.length >= MAX_IMAGE_ATTACHMENTS_PER_FEEDBACK_ITEM) {
      break
    }
  }

  return normalized
}

export function formatImageAttachmentSummary(
  attachments: FeedbackImageAttachment[] | undefined
) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  return `image_attachments: ${attachments
    .map((attachment, index) => {
      const details = formatAttachmentDetails(attachment)
      return details ? `#${index + 1} (${details})` : `#${index + 1}`
    })
    .join("; ")}`
}

export function buildFeedbackPromptContent<T extends FeedbackPromptItem>(
  text: string,
  items: T[],
  getItemLabel: (item: T) => string
) {
  const parts: FeedbackPromptPart[] = [{ type: "text", text }]
  let imageCount = 0

  for (const item of items) {
    for (const attachment of item.imageAttachments ?? []) {
      if (imageCount >= MAX_AI_IMAGE_ATTACHMENTS_PER_PROMPT) {
        return parts
      }

      const image = parseHttpUrl(attachment.url)
      if (!image) {
        continue
      }

      const details = formatAttachmentDetails(attachment)
      parts.push({
        type: "text",
        text: details
          ? `Image attachment ${imageCount + 1} for ${getItemLabel(item)} (${details}).`
          : `Image attachment ${imageCount + 1} for ${getItemLabel(item)}.`,
      })
      parts.push({
        type: "image",
        image,
        mediaType: attachment.mediaType,
      })
      imageCount += 1
    }
  }

  return imageCount > 0 ? parts : text
}

function isSlackFileUrl(url: URL) {
  const hostname = url.hostname.toLowerCase()
  return (
    hostname === "slack.com" ||
    hostname.endsWith(".slack.com") ||
    hostname.endsWith(".slack-files.com")
  )
}

async function downloadImage(url: URL, bearerToken?: string | null) {
  try {
    const response = await fetch(url, {
      headers: bearerToken
        ? {
            Authorization: `Bearer ${bearerToken}`,
          }
        : undefined,
    })
    if (!response.ok) {
      return null
    }

    const contentLength = Number(response.headers.get("content-length"))
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_IMAGE_DOWNLOAD_BYTES
    ) {
      return null
    }

    const responseMediaType = normalizeMediaType(
      response.headers.get("content-type")
    )
    if (
      responseMediaType &&
      !isImageMediaType(responseMediaType) &&
      responseMediaType !== "application/octet-stream"
    ) {
      return null
    }

    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) {
      return null
    }

    return {
      data,
      mediaType: isImageMediaType(responseMediaType)
        ? responseMediaType
        : undefined,
    }
  } catch {
    return null
  }
}

export function createFeedbackImageDownload({
  slackBotToken,
}: {
  slackBotToken?: string | null
} = {}): Experimental_DownloadFunction {
  return async (requestedDownloads) => {
    return await Promise.all(
      requestedDownloads.map(async ({ url }) => {
        const needsSlackAuth = isSlackFileUrl(url)
        if (needsSlackAuth && !slackBotToken) {
          return null
        }

        return await downloadImage(
          url,
          needsSlackAuth ? slackBotToken : undefined
        )
      })
    )
  }
}
