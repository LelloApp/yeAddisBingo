// Ethiopian Mobile Money and Banking SMS Transaction Parser

export interface ParsedTransaction {
  transactionId: string | null;
  amount: number | null;
  senderPhone?: string | null;
  detectedBank: 'telebirr' | 'cbe' | 'awash' | 'boa' | 'dashen' | 'other';
  rawText: string;
}

export function parseTransactionMessage(message: string): ParsedTransaction {
  const text = message.trim();
  let transactionId: string | null = null;
  let amount: number | null = null;
  let detectedBank: ParsedTransaction['detectedBank'] = 'other';

  if (!text) {
    return { transactionId: null, amount: null, detectedBank: 'other', rawText: text };
  }

  // 1. Detect Bank Provider
  const lower = text.toLowerCase();
  if (lower.includes('telebirr') || lower.includes('tele birr')) {
    detectedBank = 'telebirr';
  } else if (lower.includes('cbe') || lower.includes('commercial bank') || lower.includes('cbebirr')) {
    detectedBank = 'cbe';
  } else if (lower.includes('awash')) {
    detectedBank = 'awash';
  } else if (lower.includes('bank of abyssinia') || lower.includes('abyssinia') || lower.includes('boa')) {
    detectedBank = 'boa';
  } else if (lower.includes('dashen')) {
    detectedBank = 'dashen';
  }

  // 2. Parse Transaction ID using multi-bank regex patterns
  // Telebirr patterns:
  // e.g. "transaction id: 9CK104..." or "Txn ID: A12B34C" or "receipt number: ..."
  const telebirrTxnRegex = /(?:transaction\s*(?:id|no|number|ref)|txn\s*id|txnid|receipt\s*no)[\s:=#]+([A-Z0-9]{6,25})/i;
  const cbeFtRegex = /(FT[0-9A-Z]{10,20})/i;
  const genericRefRegex = /(?:ref|reference|rrn)[\s:=#]+([A-Z0-9]{6,25})/i;
  const standaloneAlphanumeric = /\b([A-Z0-9]{10,18})\b/;

  let match = text.match(telebirrTxnRegex);
  if (match && match[1]) {
    transactionId = match[1].trim();
  } else {
    match = text.match(cbeFtRegex);
    if (match && match[1]) {
      transactionId = match[1].trim();
    } else {
      match = text.match(genericRefRegex);
      if (match && match[1]) {
        transactionId = match[1].trim();
      } else {
        match = text.match(standaloneAlphanumeric);
        if (match && match[1] && !/^(TELEBIRR|COMMERCIAL|ETHIOPIAN)$/i.test(match[1])) {
          transactionId = match[1].trim();
        }
      }
    }
  }

  // 3. Parse Amount
  // e.g. "ETB 500.00", "500 ETB", "credited with 500.00 ETB", "Amount: 1,000.00"
  const amountRegex = /(?:ETB|amount|birr)[\s:=#]*([\d,]+(?:\.\d{1,2})?)/i;
  const amountFollowedRegex = /([\d,]+(?:\.\d{1,2})?)\s*(?:ETB|birr)/i;

  let amtMatch = text.match(amountRegex);
  if (!amtMatch) {
    amtMatch = text.match(amountFollowedRegex);
  }

  if (amtMatch && amtMatch[1]) {
    const cleaned = amtMatch[1].replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) {
      amount = num;
    }
  }

  return {
    transactionId: transactionId ? transactionId.toUpperCase() : null,
    amount,
    detectedBank,
    rawText: text,
  };
}
