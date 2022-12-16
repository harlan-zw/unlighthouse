import {ParsedContent} from "~/types";

export function MetaNormaliser(content: ParsedContent) {
  content.schemaOrg = content.schemaOrg || {}
  // if no published at / modified at is set we can infer from the storage meta
  if (!content.publishedAt) {
    content.publishedAt = content.storageMeta.atime
    content.schemaOrg.publishedAt = content.publishedAt
  }
  if (!content.modifiedAt) {
    content.modifiedAt = content.storageMeta.mtime
    content.schemaOrg.modifiedAt = content.modifiedAt
  }
  return content
}
