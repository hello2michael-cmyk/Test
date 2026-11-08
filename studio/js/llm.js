// Local language-model engines that run inside the browser.
//  - WebLLM (WebGPU): fast, needs iOS 26+ / a WebGPU browser.
//  - wllama (llama.cpp in WebAssembly): works without WebGPU, slower.
//  - mock: deterministic output for tests.

export const MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', engine: 'webllm', name: 'Llama 3.2 1B (recommended)', sizeMB: 880,
    note: 'Best balance of writing quality and memory. Works on iPhone 13 and newer with iOS 26.' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', engine: 'webllm', name: 'Qwen2.5 1.5B (better writing)', sizeMB: 1630,
    note: 'Stronger scripts; needs an iPhone 15 Pro or newer (8 GB).' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', engine: 'webllm', name: 'Qwen3 1.7B (best, heavy)', sizeMB: 2040, family: 'qwen3',
    note: 'Highest quality here; iPhone 16 Pro / 17 recommended.' },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', engine: 'webllm', name: 'SmolLM2 360M (lightest)', sizeMB: 376,
    note: 'Very small download; simpler scripts. Any WebGPU phone.' },
  { id: 'wllama:qwen2.5-0.5b', engine: 'wllama', name: 'Qwen2.5 0.5B on CPU (no WebGPU needed)', sizeMB: 400,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    note: 'Fallback for iOS 17–18 (no WebGPU). Slow but works everywhere.' },
  { id: 'wllama:llama-3.2-1b', engine: 'wllama', name: 'Llama 3.2 1B on CPU (no WebGPU needed)', sizeMB: 810,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    note: 'Better writing than the 0.5B, several minutes per video on CPU.' },
];

export function hasWebGPU() { return typeof navigator !== 'undefined' && !!navigator.gpu; }

export function defaultModelId() {
  return hasWebGPU() ? MODELS[0].id : MODELS.find(m => m.engine === 'wllama').id;
}

export function describeModel(id) {
  const known = MODELS.find(m => m.id === id);
  if (known) return known;
  return { id, engine: 'webllm', name: id, sizeMB: 0, family: /qwen3/i.test(id) ? 'qwen3' : undefined, note: 'Custom WebLLM model id.' };
}

const stripThink = (t) => t.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();

/** onProgress(fraction, text) */
export async function createEngine(model, onProgress) {
  if (model.engine === 'mock') return mockEngine(model.broken);
  if (model.engine === 'wllama') return wllamaEngine(model, onProgress);
  return webllmEngine(model, onProgress);
}

async function webllmEngine(model, onProgress) {
  if (!hasWebGPU()) throw new Error('This browser has no WebGPU. On iPhone you need iOS 26 or newer, or pick a "CPU" model in the Models tab.');
  const { CreateMLCEngine } = await import('../vendor/webllm.js');
  const engine = await CreateMLCEngine(model.id, {
    initProgressCallback: (r) => onProgress && onProgress(r.progress ?? 0, r.text || ''),
  }, { context_window_size: 2048 });   // the agents never need more; a smaller KV cache saves memory on phones
  const qwen3 = model.family === 'qwen3' || /qwen3/i.test(model.id);
  return {
    name: model.name,
    async complete(system, user, opts = {}, onToken) {
      await engine.resetChat();
      const prompt = qwen3 ? user + '\n/no_think' : user;
      const req = {
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.4, top_p: 0.9, max_tokens: opts.maxTokens ?? 1200, stream: true,
      };
      if (qwen3) req.extra_body = { enable_thinking: false };
      let out = '';
      const stream = await engine.chat.completions.create(req);
      for await (const chunk of stream) {
        const piece = chunk.choices?.[0]?.delta?.content || '';
        if (piece) { out += piece; onToken && onToken(piece); }
      }
      return stripThink(out);
    },
    async unload() { try { await engine.unload(); } catch {} },
  };
}

async function wllamaEngine(model, onProgress) {
  const mod = await import('../vendor/wllama/index.js');
  const Wllama = mod.Wllama || mod.default?.Wllama;
  const base = new URL('../vendor/wllama/', import.meta.url).href;
  const wllama = new Wllama({ default: base + 'wllama.wasm', 'single-thread/wllama.wasm': base + 'wllama.wasm', 'multi-thread/wllama.wasm': base + 'wllama.wasm' });
  await wllama.loadModelFromUrl(model.url, {
    n_ctx: 3072, useCache: true,
    progressCallback: ({ loaded, total }) => onProgress && onProgress(total ? loaded / total : 0, 'Downloading model'),
  });
  return {
    name: model.name,
    async complete(system, user, opts = {}, onToken) {
      const res = await wllama.createChatCompletion({
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens ?? 1200,
      });
      const text = typeof res === 'string' ? res : (res?.choices?.[0]?.message?.content ?? '');
      onToken && onToken(text);
      return stripThink(text);
    },
    async unload() { try { await wllama.exit(); } catch {} },
  };
}

// ---------- Mock engine (tests and demos; no download) ----------
function mockEngine(broken = false) {
  const json = (o) => JSON.stringify(o);
  return {
    name: broken ? 'Mock writer (broken JSON)' : 'Mock writer (demo)',
    async complete(system, user, opts, onToken) {
      let out;
      if (system.startsWith('You help make short educational videos')) {
        // Plain-text question (small-model path).
        if (/narration/i.test(user)) out = 'Attention lets the model weigh every earlier word before it writes the next one. That is how it keeps track of meaning.';
        else if (/YouTube title/i.test(user)) out = 'How Attention Works Inside a Transformer';
        else if (/ideal viewer/i.test(user)) out = 'curious beginners';
        else if (/description/i.test(user)) out = 'A one-minute explainer of attention. You will learn what it does and why it matters.';
        else out = 'Attention is the model deciding which earlier words matter most right now.';
      } else if (system.includes('DIRECTOR of a short cinematic video')) {
        const n = parseInt((user.match(/Write exactly (\d+) shots/) || [0, 6])[1], 10);
        const shots = []; for (let i = 1; i <= n; i++) shots.push({ id: i, action: `Shot ${i}: the man drives through bright city streets, tapping the dashboard screen and smiling.`, camera: i % 2 ? 'slow dolly from the passenger seat' : 'tracking shot from outside the car' });
        out = json({ title: 'City Drive at Golden Hour', logline: 'A man enjoys music while driving through a colourful city.', bible: { character: 'A man in his early thirties, short dark hair, light stubble, mustard jacket over a white tee.', props: 'A teal vintage-style coupe with cream leather seats and a large glowing centre touchscreen.', setting: 'Downtown avenues at golden hour, light traffic, warm sun flares and neon signs starting to glow.', palette: 'Warm amber, teal and magenta, saturated and pleasant.', lens: '35mm anamorphic, shallow depth of field, smooth motion' }, shots });
      } else if (broken) {
        out = 'Sure! Here is the plan:\n{"title": "Oops", "outline": []}';
      } else if (system.includes('DIRECTOR')) {
        const n = parseInt((user.match(/Produce exactly (\d+) beats/) || [0, 6])[1], 10);
        const topic = (user.match(/creator: "([^"]+)"/) || [0, 'AI'])[1];
        const visuals = ['title', 'bullets', 'diagram', 'stat', 'comparison', 'code', 'quote', 'outro'];
        const outline = [];
        for (let i = 1; i <= n; i++) outline.push({ id: i, purpose: i === 1 ? 'hook' : i === n ? 'takeaway' : 'explain', keyPoint: `Beat ${i} about ${topic}`, suggestedVisual: i === 1 ? 'title' : i === n ? 'outro' : visuals[(i) % 6 + 1] });
        out = json({ title: `Demo: ${topic}`.slice(0, 60), audience: 'curious beginners', hook: 'What if a model could explain itself?', learningObjectives: ['Understand the idea', 'See an example'], keyTakeaway: 'Attention lets models focus on what matters.', tone: 'calm and precise', outline });
      } else if (system.includes('SCRIPTWRITER')) {
        const ids = [...user.matchAll(/^(\d+)\. \[/gm)].map(m => parseInt(m[1], 10));
        out = json({ scenes: ids.map(id => ({ beatId: id, narration: id === 1 ? 'Every word a language model writes depends on which earlier words it chooses to look at.' : id === ids.length ? 'So remember: attention is the model deciding what matters, one word at a time.' : `Here is point number ${id}. It uses a short, clear sentence that a voice can read easily, with one concrete example.`, onScreenTitle: id === 1 ? 'How attention works' : `Point ${id}`, emphasisWords: ['attention', 'matters'] })) });
      } else if (system.includes('REVIEWER')) {
        out = json({ approved: true, issues: ['Beat 3 could use a concrete example.'], claimsToVerify: ['The original transformer paper was published in 2017.'], revisedNarration: {} });
      } else if (system.includes('VISUAL DESIGNER')) {
        const rows = [...user.matchAll(/^(\d+)\. layout=(\w+) \| headline="([^"]*)"/gm)];
        out = json({ scenes: rows.map(([, id, kind, headline]) => ({ beatId: parseInt(id, 10), kind, kicker: kind === 'title' ? null : 'Step ' + id, title: headline, subtitle: kind === 'title' ? 'An explainer in sixty seconds' : kind === 'outro' ? 'Subscribe for more' : null,
          bullets: kind === 'bullets' ? ['Query, key and value', 'Scores become weights', 'Weights mix the values'] : null,
          nodes: kind === 'diagram' ? ['Tokens', 'Embeddings', 'Attention', 'Output'] : null,
          leftTitle: kind === 'comparison' ? 'Fine-tuning' : null, leftItems: kind === 'comparison' ? ['Changes weights', 'Needs data'] : null,
          rightTitle: kind === 'comparison' ? 'Prompting' : null, rightItems: kind === 'comparison' ? ['Changes input', 'Instant'] : null,
          statValue: kind === 'stat' ? '80%' : null, statLabel: kind === 'stat' ? 'of compute is attention' : null,
          code: kind === 'code' ? 'scores = q @ k.T / sqrt(d)\nweights = softmax(scores)\nout = weights @ v' : null, codeLanguage: kind === 'code' ? 'python' : null,
          quote: kind === 'quote' ? 'Attention is all you need.' : null, attribution: kind === 'quote' ? 'Vaswani et al.' : null })) });
      } else {
        out = json({ title: 'How attention works in 60 seconds', description: 'A one-minute explainer.\n\nYou will learn what attention does and why it matters.', tags: ['ai', 'transformers', 'attention', 'machine learning', 'explainer'], chapters: [{ beatId: 1, label: 'Hook' }, { beatId: 2, label: 'The idea' }, { beatId: 3, label: 'How it works' }, { beatId: 4, label: 'Why it matters' }], thumbnailText: 'ATTENTION', pinnedComment: 'What should we explain next?' });
      }
      for (const piece of out.match(/.{1,24}/g) || []) { onToken && onToken(piece); await new Promise(r => setTimeout(r, 2)); }
      return out;
    },
    async unload() {},
  };
}
