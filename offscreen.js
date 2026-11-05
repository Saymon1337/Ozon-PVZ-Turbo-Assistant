/**
 * Ozon PVZ: Turbo Assistant - Offscreen Audio Engine
 * Воспроизводит громкое колокольное звуковое оповещение (D5 -> A5)
 * в выделенном невидимом документе (Offscreen Document) с разрешением AUDIO_PLAYBACK.
 *
 * Преимущества:
 * 1. Полностью освобожден от требований Autoplay Policy браузера (не требует клика по экрану).
 * 2. Исключает появление предупреждений/ошибок "The AudioContext was not allowed to start" в chrome://extensions.
 * 3. 100% надежное срабатывание звука сразу после загрузки страницы или при открытии новых вкладок.
 */

let offscreenAudioCtx = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!offscreenAudioCtx || offscreenAudioCtx.state === 'closed') {
    offscreenAudioCtx = new AudioContextClass();
  }
  return offscreenAudioCtx;
}

function playOffscreenChime(volumePercent) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startSynthesis = () => {
      try {
        const now = ctx.currentTime;
        const vol = Math.max(0, Math.min(100, Number(volumePercent) || 100)) / 100;
        if (vol <= 0) return;

        // Лимитер динамического диапазона (предотвращает клиппинг при максимальном усилении)
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.0, now);
        limiter.knee.setValueAtTime(6, now);
        limiter.ratio.setValueAtTime(12, now);
        limiter.attack.setValueAtTime(0.002, now);
        limiter.release.setValueAtTime(0.15, now);
        limiter.connect(ctx.destination);

        // Главный гейн с бустом 2.5x для пробивания шумного помещения ПВЗ
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(vol * 2.5, now);
        masterGain.connect(limiter);

        // Тон 1: Ре пятой октавы (D5 ~587 Гц, Triangle)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.linearRampToValueAtTime(0.85, now + 0.006);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.23);

        // Обертон D6 (1174 Гц, Sine)
        const osc1b = ctx.createOscillator();
        const gain1b = ctx.createGain();
        osc1b.type = 'sine';
        osc1b.frequency.setValueAtTime(1174.66, now);
        gain1b.gain.setValueAtTime(0.001, now);
        gain1b.gain.linearRampToValueAtTime(0.45, now + 0.006);
        gain1b.gain.exponentialRampToValueAtTime(0.005, now + 0.20);
        osc1b.connect(gain1b);
        gain1b.connect(masterGain);
        osc1b.start(now);
        osc1b.stop(now + 0.21);

        // Тон 2: Ля пятой октавы (A5 ~880 Гц, Triangle)
        const t2 = now + 0.16;
        const t2End = now + 0.82;

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880.00, t2);
        gain2.gain.setValueAtTime(0.001, t2);
        gain2.gain.linearRampToValueAtTime(0.95, t2 + 0.006);
        gain2.gain.exponentialRampToValueAtTime(0.0001, t2End);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(t2);
        osc2.stop(t2End);

        // Обертон A6 (1760 Гц, Sine)
        const osc2b = ctx.createOscillator();
        const gain2b = ctx.createGain();
        osc2b.type = 'sine';
        osc2b.frequency.setValueAtTime(1760.00, t2);
        gain2b.gain.setValueAtTime(0.001, t2);
        gain2b.gain.linearRampToValueAtTime(0.50, t2 + 0.006);
        gain2b.gain.exponentialRampToValueAtTime(0.0001, t2End - 0.10);
        osc2b.connect(gain2b);
        gain2b.connect(masterGain);
        osc2b.start(t2);
        osc2b.stop(t2End);

        // Высокий обертон E7 (2637 Гц, Sine)
        const osc2c = ctx.createOscillator();
        const gain2c = ctx.createGain();
        osc2c.type = 'sine';
        osc2c.frequency.setValueAtTime(2637.02, t2);
        gain2c.gain.setValueAtTime(0.001, t2);
        gain2c.gain.linearRampToValueAtTime(0.35, t2 + 0.006);
        gain2c.gain.exponentialRampToValueAtTime(0.0001, t2End - 0.20);
        osc2c.connect(gain2c);
        gain2c.connect(masterGain);
        osc2c.start(t2);
        osc2c.stop(t2End);
      } catch (err) {
        console.warn('[Offscreen Audio] Synthesis error:', err);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          startSynthesis();
        }
      }).catch(() => { });
    } else {
      startSynthesis();
    }
  } catch (err) {
    console.warn('[Offscreen Audio] Error:', err);
  }
}

// Прием команд на воспроизведение
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'offscreen' && message?.type === 'OFFSCREEN_PLAY_CHIME') {
    playOffscreenChime(message.volume);
    sendResponse({ played: true });
    return true;
  }
});
