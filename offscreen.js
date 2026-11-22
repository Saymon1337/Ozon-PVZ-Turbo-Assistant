/**
 * Ozon PVZ: Turbo Assistant - Offscreen Audio Engine (v2.1.0)
 * Высокоточный синтезатор 10 типов звуковых оповещений на базе Web Audio API.
 * Работает в выделенном Offscreen Document с разрешением AUDIO_PLAYBACK
 * без ограничений Autoplay Policy браузера.
 * 
 * Разработчик: Saymon1337
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

/**
 * Создает мастер-узел с лимитером компрессии (защита от клиппинга и искажений)
 */
function createMasterOutput(ctx, volumePercent, boostMultiplier = 2.0) {
  const now = ctx.currentTime;
  const vol = Math.max(0, Math.min(100, Number(volumePercent) !== undefined ? Number(volumePercent) : 100)) / 100;
  if (vol <= 0) return null;

  // Динамический лимитер
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-1.0, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(14, now);
  limiter.attack.setValueAtTime(0.002, now);
  limiter.release.setValueAtTime(0.12, now);
  limiter.connect(ctx.destination);

  // Мастер-громкость с усилением
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(vol * boostMultiplier, now);
  masterGain.connect(limiter);

  return masterGain;
}

// -----------------------------------------------------------------------------
// 1. Стандартный колокольный звонок (D5 -> A5) [Текущий дефолт]
// -----------------------------------------------------------------------------
function playDefaultChime(ctx, masterGain, now) {
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
}

// -----------------------------------------------------------------------------
// 2. Мягкий колокольчик (E5 -> G#5 -> B5, синусоидальный теплый перезвон)
// -----------------------------------------------------------------------------
function playSoftChime(ctx, masterGain, now) {
  const notes = [659.25, 830.61, 987.77]; // E5, G#5, B5
  notes.forEach((freq, i) => {
    const t = now + i * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.65, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.86);
  });
}

// -----------------------------------------------------------------------------
// 3. Двойной бип (Четкий электронный сигнал)
// -----------------------------------------------------------------------------
function playDoubleBeep(ctx, masterGain, now) {
  [0, 0.14].forEach((offset) => {
    const t = now + offset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.9, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.10);
  });
}

// -----------------------------------------------------------------------------
// 4. Срочная сирена (Двойной нарастающий свип)
// -----------------------------------------------------------------------------
function playUrgentSiren(ctx, masterGain, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';

  // Фильтр для смягчения верхов пилы
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, now);

  // Цикл 1: 620 -> 980 -> 620
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.linearRampToValueAtTime(980, now + 0.12);
  osc.frequency.linearRampToValueAtTime(620, now + 0.24);
  // Цикл 2: 620 -> 1050 -> 620
  osc.frequency.linearRampToValueAtTime(1050, now + 0.36);
  osc.frequency.linearRampToValueAtTime(620, now + 0.48);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.75, now + 0.02);
  gain.gain.setValueAtTime(0.75, now + 0.44);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.53);
}

// -----------------------------------------------------------------------------
// 5. Мелодичный аккорд (C5 -> E5 -> G5 -> C6 восходящее арпеджио)
// -----------------------------------------------------------------------------
function playMelodicChord(ctx, masterGain, now) {
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const t = now + idx * 0.08;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.72);
  });
}

// -----------------------------------------------------------------------------
// 6. Ретро-сигнал (8-bit аркадный фанфар)
// -----------------------------------------------------------------------------
function playRetroSignal(ctx, masterGain, now) {
  const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
  notes.forEach((freq, idx) => {
    const t = now + idx * 0.055;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.setValueAtTime(0.4, t + 0.003);
    gain.gain.setValueAtTime(0.4, t + 0.045);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.052);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.055);
  });
}

// -----------------------------------------------------------------------------
// 7. Кристальный звон (F6 + обертоны звона тонкого стекла)
// -----------------------------------------------------------------------------
function playCrystalBell(ctx, masterGain, now) {
  const freqs = [1396.91, 2093.00, 3492.28];
  const amps = [0.75, 0.45, 0.25];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(amps[i], now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.96);
  });
}

// -----------------------------------------------------------------------------
// 8. Короткий щелчок (Лаконичный клик-пинг)
// -----------------------------------------------------------------------------
function playShortClick(ctx, masterGain, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.95, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.065);
}

// -----------------------------------------------------------------------------
// 9. Нежный пинг (Одиночный чистый колокольчик C6)
// -----------------------------------------------------------------------------
function playSubtlePing(ctx, masterGain, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1046.50, now); // C6

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.7, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  // Мягкий обертон C7
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(2093.00, now);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.linearRampToValueAtTime(0.25, now + 0.006);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

  osc.connect(gain);
  gain.connect(masterGain);
  osc2.connect(gain2);
  gain2.connect(masterGain);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + 0.56);
  osc2.stop(now + 0.42);
}

// -----------------------------------------------------------------------------
// 10. Радар / Сонар (Импульс гидролокатора с резонансом)
// -----------------------------------------------------------------------------
function playRadarSonar(ctx, masterGain, now) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(820, now);
  osc.frequency.exponentialRampToValueAtTime(540, now + 0.28);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.85, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.86);
}

// -----------------------------------------------------------------------------
// Словарь звуковых функций
// -----------------------------------------------------------------------------
const SOUND_HANDLERS = {
  'default': playDefaultChime,
  'soft_chime': playSoftChime,
  'double_beep': playDoubleBeep,
  'urgent_siren': playUrgentSiren,
  'melodic_chord': playMelodicChord,
  'retro_signal': playRetroSignal,
  'crystal_bell': playCrystalBell,
  'short_click': playShortClick,
  'subtle_ping': playSubtlePing,
  'radar_sonar': playRadarSonar,
};

/**
 * Единая точка воспроизведения звука
 */
function playOffscreenChime(soundId, volumePercent) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startSynthesis = () => {
      try {
        const masterGain = createMasterOutput(ctx, volumePercent, 2.5);
        if (!masterGain) return; // Muted

        const key = soundId && SOUND_HANDLERS[soundId] ? soundId : 'default';
        const handler = SOUND_HANDLERS[key] || playDefaultChime;
        handler(ctx, masterGain, ctx.currentTime);
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
    playOffscreenChime(message.soundId, message.volume);
    sendResponse({ played: true });
    return true;
  }
});
