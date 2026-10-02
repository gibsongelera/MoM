// One-off probe: validates ElevenLabs keyterms multipart encoding WITHOUT
// submitting any audio (no file/source_url), so no transcription is billed.
// If keyterms encoding is invalid we get invalid_keyword_length; if valid,
// the API instead complains about the missing audio source.
const API_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY not set');

const terms = ['ZPPSU', 'Zamboanga Peninsula Polytechnic State University', 'CHED CMO', 'Data Privacy Act', 'RA 10173'];

async function attempt(label, build) {
  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  build(form);
  const res = await fetch(API_URL, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
  const text = await res.text();
  console.log(`--- ${label}: HTTP ${res.status}`);
  console.log(text.slice(0, 500));
}

// 1. Current code: repeated plain fields
await attempt('repeated keyterms fields (current code)', (f) => {
  for (const t of terms) f.append('keyterms', t);
});

// 2. Old code: one JSON-stringified field
await attempt('single JSON.stringify field (old code)', (f) => {
  f.append('keyterms', JSON.stringify(terms));
});

// 3. Repeated fields but one term >= 50 chars
await attempt('repeated fields with one 60-char term', (f) => {
  f.append('keyterms', 'x'.repeat(60));
  f.append('keyterms', 'ZPPSU');
});
