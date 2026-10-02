// Free probe: is `source_url` a recognized param? A malformed URL should
// produce a URL-specific validation error if so, or "must provide file or a
// URL parameter" if the field name is being ignored.
const key = process.env.ELEVENLABS_API_KEY;
const form = new FormData();
form.append('model_id', 'scribe_v2');
form.append('source_url', 'not-a-valid-url');
const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
  method: 'POST',
  headers: { 'xi-api-key': key },
  body: form,
});
console.log('HTTP', res.status);
console.log((await res.text()).slice(0, 500));
