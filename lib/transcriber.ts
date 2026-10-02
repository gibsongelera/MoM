// Transcription helpers — TS port of assets/js/transcriber.js.
// Web Speech API live capture + canned bilingual fallback. In Phase 2 the
// upload/live flows call the real /api/transcribe route; this stays as the
// offline/no-permission fallback.

import type { TranscriptSegment } from './types';
import { detectLang } from './lang-detect';

interface Canned {
  speaker: string;
  text: string;
}

const CANNED_EN: Canned[] = [
  { speaker: 'Engr. Ricardo Gomez', text: 'Good morning, colleagues. Let us call this meeting to order. We have a quorum present today.' },
  { speaker: 'Sarah Torres', text: 'Thank you, sir. The minutes of our previous meeting have been circulated. I move for their approval.' },
  { speaker: 'Dr. Maria Santos', text: 'I second the motion. The minutes accurately reflect what was discussed.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Approved without corrections. Our first agenda item is the curriculum review. Dr. Villanueva, please proceed.' },
  { speaker: 'Prof. Antonette Villanueva', text: 'We need to finalize the curriculum updates by next week. The board expects our compliance report aligned with the new CHED CMO.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'I agree. Prof. Dela Cruz, please compile the syllabus drafts and have them ready by Thursday next week.' },
  { speaker: 'Prof. Juan Dela Cruz', text: 'Yes, I will coordinate with the other instructors and consolidate the drafts.' },
  { speaker: 'Dr. Maria Santos', text: 'Regarding IT infrastructure, we propose a budget of 1.2 million pesos for Lab 3 networking upgrades. The Finance committee should endorse this to the VP for Academic Affairs by next week.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Noted. I will draft the endorsement letter by July 22.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'With no other business, this meeting is adjourned.' },
];

const CANNED_TL: Canned[] = [
  { speaker: 'Engr. Ricardo Gomez', text: 'Magandang umaga sa inyong lahat. Pormal na binuksan ang ating pulong. May kumporme tayo ngayon.' },
  { speaker: 'Sarah Torres', text: 'Salamat. Iminumungkahi ko ang pag-aapruba sa katitikan ng nakaraang pulong.' },
  { speaker: 'Dr. Maria Santos', text: 'Sinusuportahan ko ang mosyon. Maayos at tumpak ang nasabing katitikan.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Aprubado. Susunod, ang pagrerepaso ng kurikulum. Prof. Villanueva, ipagpatuloy po.' },
  { speaker: 'Prof. Antonette Villanueva', text: 'Kailangan nating tapusin ang pagbabago sa kurikulum sa susunod na linggo upang umayon sa bagong CHED CMO.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Sumasang-ayon ako. Prof. Dela Cruz, pakikoordinasyon sa mga tagapagturo at isumite ang mga silabus sa Huwebes ng susunod na linggo.' },
  { speaker: 'Prof. Juan Dela Cruz', text: 'Opo, makikipag-ugnayan ako sa lahat at ipagsasama-sama ang mga draft.' },
  { speaker: 'Dr. Maria Santos', text: 'Tungkol sa IT, iminumungkahi naming maglaan ng 1.2 milyong piso para sa Lab 3. Kailangang i-endorso ito ng komite ng pinansya.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Tatapusin ko ang sulat ng pag-endorso bago mag-July 22.' },
  { speaker: 'Engr. Ricardo Gomez', text: 'Tapos na ang pulong. Salamat sa inyong lahat.' },
];

export function generateMockTranscript(lang = 'en-US', count = 8): TranscriptSegment[] {
  const auto = lang === 'auto';
  const out: TranscriptSegment[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    // Auto mode simulates a code-switched (Taglish) meeting by alternating.
    const corpus = auto ? (i % 2 === 0 ? CANNED_EN : CANNED_TL) : lang.startsWith('tl') ? CANNED_TL : CANNED_EN;
    const seg = corpus[i % corpus.length];
    out.push({ speaker: seg.speaker, text: seg.text, t, confidence: 0.93 + Math.random() * 0.06, lang: detectLang(seg.text) });
    t += 18 + Math.random() * 12;
  }
  return out;
}

// SpeechRecognition isn't in the default DOM lib types; access via a loose cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSR(): any {
  if (typeof window === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
  return !!getSR();
}

interface LiveOpts {
  lang?: string;
  onSegment?: (seg: TranscriptSegment) => void;
  onPartial?: (text: string) => void;
  onError?: (err: string) => void;
  useMockOnly?: boolean;
}

export class LiveTranscriber {
  lang: string;
  onSegment: (seg: TranscriptSegment) => void;
  onPartial: (text: string) => void;
  onError: (err: string) => void;
  useMockOnly: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private mockTimer: ReturnType<typeof setTimeout> | null = null;
  private mockIdx = 0;
  private startedAt = 0;
  private running = false;

  constructor({ lang = 'en-US', onSegment, onPartial, onError, useMockOnly = false }: LiveOpts = {}) {
    this.lang = lang;
    this.onSegment = onSegment || (() => {});
    this.onPartial = onPartial || (() => {});
    this.onError = onError || (() => {});
    this.useMockOnly = useMockOnly;
  }

  start(): 'web-speech' | 'mock' {
    this.startedAt = Date.now();
    this.running = true;
    const SRClass = getSR();
    if (SRClass && !this.useMockOnly) {
      try {
        this.startWebSpeech(SRClass);
        return 'web-speech';
      } catch {
        // fall through to mock
      }
    }
    this.startMock();
    return 'mock';
  }

  stop() {
    this.running = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    if (this.mockTimer) {
      clearTimeout(this.mockTimer);
      this.mockTimer = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private startWebSpeech(SRClass: any) {
    const rec = new SRClass();
    // Web Speech takes a single locale; 'auto' uses English as the base engine
    // and each finished segment is tagged EN/TL by heuristic afterwards.
    rec.lang = this.lang === 'auto' ? 'en-US' : this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) {
          this.onSegment({ speaker: 'Live Speaker', text, t: (Date.now() - this.startedAt) / 1000, confidence: r[0].confidence || 0.95, lang: detectLang(text) });
        } else {
          this.onPartial(text);
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech') return;
      this.onError(e.error || 'recognition_error');
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) this.startMock();
    };
    rec.onend = () => {
      if (this.running) {
        try {
          rec.start();
        } catch {}
      }
    };
    rec.start();
    this.recognition = rec;
  }

  private startMock() {
    const auto = this.lang === 'auto';
    this.mockIdx = 0;
    const tick = () => {
      if (!this.running) return;
      const corpus = auto ? (this.mockIdx % 2 === 0 ? CANNED_EN : CANNED_TL) : this.lang.startsWith('tl') ? CANNED_TL : CANNED_EN;
      const seg = corpus[this.mockIdx % corpus.length];
      this.onSegment({ speaker: seg.speaker, text: seg.text, t: (Date.now() - this.startedAt) / 1000, confidence: 0.93 + Math.random() * 0.06, lang: detectLang(seg.text) });
      this.mockIdx += 1;
      this.mockTimer = setTimeout(tick, 2800 + Math.random() * 2200);
    };
    this.mockTimer = setTimeout(tick, 1500);
  }
}
