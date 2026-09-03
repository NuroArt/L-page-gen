// pageBuilder.js
// Assembles the two documents users ever see:
//   - previewHtml: hero (real, from Claude) + a locked placeholder section
//     (our own markup, NOT from Claude — nothing of value below the hero
//     is ever sent to the browser before payment). This is PURELY VISUAL —
//     it has no interactive button or script. It's loaded inside an iframe
//     on preview.html, and Stripe Checkout refuses to run inside an iframe,
//     so the real "Unlock" button and its checkout-triggering script live in
//     preview.html itself (the top-level page), not in this document.
//   - fullHtml: hero + rest (both real, from Claude) — only ever served
//     server-side after the store confirms `paid: true`

const LOCK_OVERLAY_STYLES = `
.nlp-locked-wrap { position: relative; margin-top: 0; }
.nlp-locked-blur {
  filter: blur(6px);
  pointer-events: none;
  user-select: none;
  opacity: 0.55;
}
.nlp-locked-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.98) 60%);
}
.nlp-locked-overlay h3 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #1B1F3B; }
.nlp-locked-overlay p { margin: 0; color: #44475A; max-width: 32rem; }
`;

// A generic "shape of a page" placeholder — grey blocks mimicking sections,
// blurred, with a purely decorative message overlay (no button — the real
// button lives on the parent page, outside this iframe content).
function buildLockedPlaceholder() {
  return `
<div class="nlp-locked-wrap">
  <div class="nlp-locked-blur" aria-hidden="true">
    <section style="padding:4rem 2rem; max-width:1100px; margin:0 auto;">
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:2rem;">
        <div style="height:160px; background:#EFEDFB; border-radius:12px;"></div>
        <div style="height:160px; background:#EFEDFB; border-radius:12px;"></div>
        <div style="height:160px; background:#EFEDFB; border-radius:12px;"></div>
      </div>
    </section>
    <section style="padding:4rem 2rem; max-width:900px; margin:0 auto; text-align:center;">
      <div style="height:24px; width:60%; background:#EFEDFB; border-radius:6px; margin:0 auto 1rem;"></div>
      <div style="height:16px; width:80%; background:#F5F6FA; border-radius:6px; margin:0 auto 0.5rem;"></div>
      <div style="height:16px; width:70%; background:#F5F6FA; border-radius:6px; margin:0 auto;"></div>
    </section>
    <section style="padding:4rem 2rem; max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
      <div style="height:220px; background:#EFEDFB; border-radius:12px;"></div>
      <div style="height:220px; background:#EFEDFB; border-radius:12px;"></div>
    </section>
  </div>
  <div class="nlp-locked-overlay">
    <h3>The rest of your page is ready.</h3>
    <p>Value propositions, social proof, a features section, and a closing call-to-action — written specifically for your business. Use the Unlock button on this page to see it and download the file.</p>
  </div>
</div>`;
}

/**
 * Builds the free preview document: real hero + purely decorative locked
 * placeholder. No button, no script — this document only ever renders
 * passively inside an iframe. The interactive "Unlock" flow lives in
 * preview.html itself (the top-level page).
 */
function buildPreviewDocument({ htmlOpenTag, headInner, heroHtml }) {
  return `<!DOCTYPE html>
${htmlOpenTag}
<head>
${headInner}
<style>${LOCK_OVERLAY_STYLES}</style>
</head>
<body>
${heroHtml}
${buildLockedPlaceholder()}
</body>
</html>`;
}

/** Builds the final, complete, downloadable document — only ever served after payment is confirmed. */
function buildFullDocument({ htmlOpenTag, headInner, heroHtml, restHtml }) {
  return `<!DOCTYPE html>
${htmlOpenTag}
<head>
${headInner}
</head>
<body>
${heroHtml}
${restHtml}
</body>
</html>`;
}

module.exports = { buildPreviewDocument, buildFullDocument };
