import {
  mergeReceiptParts as mergeBaseReceiptParts,
  normalizeForMatch,
  normalizeReceiptText,
  parseReceiptText as parseBaseReceiptText,
  similarityScore,
  type ParsedReceipt as BaseParsedReceipt,
  type ParsedReceiptItem as BaseParsedReceiptItem,
  type ReceiptConfidence,
} from './receipt-parser'

export type { ReceiptConfidence }

export type ParsedReceiptItem = BaseParsedReceiptItem & {
  productId: string
}

export type ParsedReceipt = Omit<BaseParsedReceipt, 'items'> & {
  items: ParsedReceiptItem[]
}

function makeReviewReady(receipt: BaseParsedReceipt): ParsedReceipt {
  return {
    ...receipt,
    items: receipt.items.map((item) => ({ ...item, productId: '' })),
  }
}

export function parseReceiptText(text: string): ParsedReceipt {
  return makeReviewReady(parseBaseReceiptText(text))
}

export function mergeReceiptParts(parts: ParsedReceipt[]): ParsedReceipt {
  return makeReviewReady(mergeBaseReceiptParts(parts))
}

export { normalizeForMatch, normalizeReceiptText, similarityScore }
