// pageBuilder.js
// Assembles the two documents users ever see:
//   - previewHtml: hero (real, from Claude) + a locked placeholder section
//     (our own markup, NOT from Claude — nothing of value below the hero
//     is ever sent to the browser before payment)
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
.nlp-locked-overlay p { margin: 0 0 1.25rem; color: #44475A; max-width: 32rem; }
.nlp-unlock-btn {
  display: inline-block;
  background: #5B3FE0;
  color: #fff;
  padding: 0.85rem 1.75rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
}
.nlp-unlock-btn:hover { background: #4b32c2; }
`;

// A generic "shape of a page" placeholder — grey blocks mimicking sections,
// blurred, with an unlock overlay on top. Purely decorative, no real content.
function buildLockedPlaceholder(unlockPriceLabel) {
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
    <p>Value propositions, social proof, a features section, and a closing call-to-action — written specifically for your business. Unlock the full page to see it and download the file.</p>
    <button class="nlp-unlock-btn" id="nlp-unlock-button">Unlock Full Page — ${unlockPriceLabel}</button>
  </div>
</div>`;
}

/**
 * Builds the free preview document: real hero + locked placeholder + an
 * unlock button wired to POST /api/checkout for the given generation id.
 */
function buildPreviewDocument({ htmlOpenTag, headInner, heroHtml, unlockPriceLabel, generationId }) {
  return `<!DOCTYPE html>
${htmlOpenTag}
<head>
${headInner}
<style>${LOCK_OVERLAY_STYLES}</style>
</head>
<body>
${heroHtml}
${buildLockedPlaceholder(unlockPriceLabel)}
<script>
document.getElementById('nlp-unlock-button').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = 'Redirecting to checkout...';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId: ${JSON.stringify(generationId)} }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      this.disabled = false;
      this.textContent = 'Unlock Full Page — ${unlockPriceLabel}';
      alert('Something went wrong starting checkout. Please try again.');
    }
  } catch (err) {
    this.disabled = false;
    this.textContent = 'Unlock Full Page — ${unlockPriceLabel}';
    alert('Something went wrong starting checkout. Please try again.');
  }
});
</script>
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
