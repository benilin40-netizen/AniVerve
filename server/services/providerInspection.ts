export interface AniEmbedHtmlInspection {
  ok: boolean;
  httpStatus: number;
  extractedStatus: number;
  reason: string | null;
  hasSubProviders: boolean | null;
  hasDubProviders: boolean | null;
}

export function inspectAniEmbedHtml(
  html: string,
  httpStatus: number,
  requestedLang?: 'sub' | 'dub'
): AniEmbedHtmlInspection {
  if (httpStatus >= 400) {
    return {
      ok: false,
      httpStatus,
      extractedStatus: httpStatus,
      reason: `AniEmbed returned HTTP ${httpStatus}.`,
      hasSubProviders: null,
      hasDubProviders: null,
    };
  }

  const lower = (html || '').toLowerCase();
  if (!lower.includes('<html') && !lower.includes('<!doctype html')) {
    return {
      ok: false,
      httpStatus,
      extractedStatus: 502,
      reason: 'AniEmbed returned an invalid non-HTML response.',
      hasSubProviders: null,
      hasDubProviders: null,
    };
  }

  // Detect SSR / SvelteKit soft-404 and upstream API failure payloads rendered inside the iframe page
  const apiStatusMatch = html.match(/API responded with\s+(\d{3})/i);
  if (apiStatusMatch) {
    const code = Number(apiStatusMatch[1]) || 404;
    return {
      ok: false,
      httpStatus,
      extractedStatus: code,
      reason: `AniEmbed reported upstream error: API responded with ${code}.`,
      hasSubProviders: false,
      hasDubProviders: false,
    };
  }

  const svelteErrorMatch = html.match(/\berror\s*:\s*"([^"]+)"/i);
  if (svelteErrorMatch && svelteErrorMatch[1].trim()) {
    const rawMsg = svelteErrorMatch[1].trim();
    const numMatch = rawMsg.match(/\b(\d{3})\b/);
    const extracted = numMatch ? Number(numMatch[1]) : 404;
    return {
      ok: false,
      httpStatus,
      extractedStatus: Number.isFinite(extracted) ? extracted : 404,
      reason: `AniEmbed reported: ${rawMsg}`,
      hasSubProviders: false,
      hasDubProviders: false,
    };
  }

  if (
    /couldn(?:'|&#39;|&apos;|’)t load the player/i.test(html) ||
    /\bservers\s*:\s*null\b/i.test(html)
  ) {
    return {
      ok: false,
      httpStatus,
      extractedStatus: 404,
      reason: 'AniEmbed has no playable servers indexed for this episode.',
      hasSubProviders: false,
      hasDubProviders: false,
    };
  }

  // Extract subProviders / dubProviders availability from SvelteKit hydration object if present
  let hasSubProviders: boolean | null = null;
  let hasDubProviders: boolean | null = null;

  const subEmpty = /\bsubProviders\s*:\s*\[\s*\]/i.test(html);
  const subPopulated = /\bsubProviders\s*:\s*\[\s*\{/i.test(html);
  if (subEmpty) hasSubProviders = false;
  else if (subPopulated) hasSubProviders = true;

  const dubEmpty = /\bdubProviders\s*:\s*\[\s*\]/i.test(html);
  const dubPopulated = /\bdubProviders\s*:\s*\[\s*\{/i.test(html);
  if (dubEmpty) hasDubProviders = false;
  else if (dubPopulated) hasDubProviders = true;

  if (requestedLang === 'dub' && hasDubProviders === false) {
    return {
      ok: false,
      httpStatus,
      extractedStatus: 404,
      reason: 'Episode unavailable in DUB on AniEmbed.',
      hasSubProviders,
      hasDubProviders,
    };
  }

  if (requestedLang === 'sub' && hasSubProviders === false) {
    return {
      ok: false,
      httpStatus,
      extractedStatus: 404,
      reason: 'Episode unavailable in SUB on AniEmbed.',
      hasSubProviders,
      hasDubProviders,
    };
  }

  return {
    ok: true,
    httpStatus,
    extractedStatus: httpStatus || 200,
    reason: null,
    hasSubProviders,
    hasDubProviders,
  };
}
