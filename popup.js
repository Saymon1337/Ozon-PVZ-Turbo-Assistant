/**
 * Ozon PVZ: Turbo Assistant — Popup Script (v2.0.0)
 * Управление защитой сканера, громкими оповещениями об отправке и темами
 * Разработчик: Saymon1337
 */

document.addEventListener('DOMContentLoaded', () => {
  // Элементы темы оформления
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');

  // Элементы модуля 1 (Защита сканера)
  const toggleGuard = document.getElementById('toggleGuard');
  const blockedCountEl = document.getElementById('blockedCount');
  const resetBtn = document.getElementById('resetBtn');
  const statusDot = document.getElementById('statusDot');

  // Элементы модуля 2 (Оповещение об отправке)
  const shelfToggle = document.getElementById('shelfToggle');
  const shelfCountEl = document.getElementById('shelfCount');
  const shelfBadgeEl = document.getElementById('shelfBadge');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValEl = document.getElementById('volumeVal');
  const intervalSelect = document.getElementById('intervalSelect');
  const testSoundBtn = document.getElementById('testSoundBtn');

  let popupAudioCtx = null;
  let currentTheme = 'dark';

  /**
   * Применение темы оформления (Светлая / Темная)
   */
  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    if (currentTheme === 'light') {
      document.body.className = 'theme-light';
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Светлая';
    } else {
      document.body.className = 'theme-dark';
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Темная';
    }
  }

  // Переключение темы по клику
  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    chrome.storage.local.set({ theme: nextTheme });
  });

  /**
   * СИНТЕЗАТОР ГРОМКОГО КОЛОКОЛЬНОГО ЗВОНКА (D5 -> A5: 587 Гц -> 880 Гц)
   * С двойным усилением (Boost 2.5x), лимитером и богатыми обертонами (1174, 1760, 2637 Гц).
   */
  function playChime(volumePercent) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!popupAudioCtx || popupAudioCtx.state === 'closed') {
        popupAudioCtx = new AudioContextClass();
      }

      const startSynthesis = () => {
        try {
          const now = popupAudioCtx.currentTime;
          const vol = Math.max(0, Math.min(100, Number(volumePercent) || 100)) / 100;
          if (vol <= 0) return;

          // Лимитер от перегрузки при усилении
          const limiter = popupAudioCtx.createDynamicsCompressor();
          limiter.threshold.setValueAtTime(-1.0, now);
          limiter.knee.setValueAtTime(6, now);
          limiter.ratio.setValueAtTime(12, now);
          limiter.attack.setValueAtTime(0.002, now);
          limiter.release.setValueAtTime(0.15, now);
          limiter.connect(popupAudioCtx.destination);

          // Мастер-усилитель (Boost 2.5x)
          const masterGain = popupAudioCtx.createGain();
          masterGain.gain.setValueAtTime(vol * 2.5, now);
          masterGain.connect(limiter);

          // Тон 1: Ре пятой октавы (D5: ~587 Гц, Triangle)
          const osc1 = popupAudioCtx.createOscillator();
          const gain1 = popupAudioCtx.createGain();
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
          const osc1b = popupAudioCtx.createOscillator();
          const gain1b = popupAudioCtx.createGain();
          osc1b.type = 'sine';
          osc1b.frequency.setValueAtTime(1174.66, now);
          gain1b.gain.setValueAtTime(0.001, now);
          gain1b.gain.linearRampToValueAtTime(0.45, now + 0.006);
          gain1b.gain.exponentialRampToValueAtTime(0.005, now + 0.20);
          osc1b.connect(gain1b);
          gain1b.connect(masterGain);
          osc1b.start(now);
          osc1b.stop(now + 0.21);

          // Тон 2: Ля пятой октавы (A5: 880 Гц, Triangle)
          const t2 = now + 0.16;
          const t2End = now + 0.82;

          const osc2 = popupAudioCtx.createOscillator();
          const gain2 = popupAudioCtx.createGain();
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
          const osc2b = popupAudioCtx.createOscillator();
          const gain2b = popupAudioCtx.createGain();
          osc2b.type = 'sine';
          osc2b.frequency.setValueAtTime(1760.00, t2);
          gain2b.gain.setValueAtTime(0.001, t2);
          gain2b.gain.linearRampToValueAtTime(0.50, t2 + 0.006);
          gain2b.gain.exponentialRampToValueAtTime(0.0001, t2End - 0.10);
          osc2b.connect(gain2b);
          gain2b.connect(masterGain);
          osc2b.start(t2);
          osc2b.stop(t2End);

          // Высокий обертон E7 (2637 Гц, Sine - максимальная слышимость)
          const osc2c = popupAudioCtx.createOscillator();
          const gain2c = popupAudioCtx.createGain();
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
          console.warn('[Popup] Audio synthesis error:', err);
        }
      };

      if (popupAudioCtx.state === 'suspended') {
        popupAudioCtx.resume().then(() => {
          if (popupAudioCtx.state === 'running') {
            startSynthesis();
          }
        }).catch(() => { });
      } else {
        startSynthesis();
      }
    } catch (err) {
      console.warn('[Popup] Web Audio error:', err);
    }
  }

  function updateShelfDisplay(count) {
    const num = Number(count) || 0;
    shelfCountEl.textContent = `${num} шт`;

    if (num > 0) {
      shelfCountEl.style.color = 'var(--accent-red)';
      shelfBadgeEl.className = 'shelf-badge alert';
      shelfBadgeEl.textContent = 'Требует отправки';
    } else {
      shelfCountEl.style.color = 'var(--accent-green)';
      shelfBadgeEl.className = 'shelf-badge ready';
      shelfBadgeEl.textContent = 'Полка пуста';
    }
  }

  function updateStatusDot() {
    const isAnyActive = toggleGuard.checked || shelfToggle.checked;
    if (isAnyActive) {
      statusDot.classList.remove('off');
    } else {
      statusDot.classList.add('off');
    }
  }

  // 1. Слушаем прямые сообщения от content.js для мгновенного обновления счетчика без задержек
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'BLOCKED_COUNT_UPDATED') {
        const count = Number(msg.count) || 0;
        blockedCountEl.textContent = count;
      }
    });
  }

  // 2. Читаем начальные значения из chrome.storage.local
  chrome.storage.local.get(
    {
      enabled: true,
      blockedCount: 0,
      shelfAlertEnabled: true,
      shelfAlertVolume: 100,
      shelfAlertInterval: 10,
      shelfCount: 0,
      theme: 'dark'
    },
    (data) => {
      applyTheme(data.theme || 'dark');

      toggleGuard.checked = data.enabled !== false;
      blockedCountEl.textContent = Number(data.blockedCount) || 0;

      shelfToggle.checked = data.shelfAlertEnabled !== false;
      const vol = data.shelfAlertVolume ?? 100;
      volumeSlider.value = vol;
      volumeValEl.textContent = `${vol}%`;

      intervalSelect.value = String(data.shelfAlertInterval ?? 10);

      updateShelfDisplay(data.shelfCount || 0);
      updateStatusDot();
    }
  );

  // 3. Обработчик тумблера Защиты сканера
  toggleGuard.addEventListener('change', () => {
    const isEnabled = toggleGuard.checked;
    chrome.storage.local.set({ enabled: isEnabled });
    updateStatusDot();
  });

  // 4. Сброс счетчика сбоев
  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedCount: 0 });
    blockedCountEl.textContent = '0';
  });

  // 5. Обработчик тумблера Оповещения об отправке
  shelfToggle.addEventListener('change', () => {
    const isEnabled = shelfToggle.checked;
    chrome.storage.local.set({ shelfAlertEnabled: isEnabled });
    updateStatusDot();
  });

  // 6. Обработчик ползунка громкости
  volumeSlider.addEventListener('input', () => {
    const vol = Number(volumeSlider.value);
    volumeValEl.textContent = `${vol}%`;
    chrome.storage.local.set({ shelfAlertVolume: vol });
  });

  // 7. Обработчик селектора интервала повтора напоминания
  intervalSelect.addEventListener('change', () => {
    const interval = Number(intervalSelect.value) || 10;
    chrome.storage.local.set({ shelfAlertInterval: interval });
  });

  // 8. Кнопка теста звука
  testSoundBtn.addEventListener('click', () => {
    const vol = Number(volumeSlider.value);
    playChime(vol);
  });

  // 9. Обновление значений в реальном времени при открытом Popup через storage.onChanged
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.theme !== undefined) {
        applyTheme(changes.theme.newValue);
      }
      if (changes.blockedCount !== undefined) {
        const count = Number(changes.blockedCount.newValue) || 0;
        blockedCountEl.textContent = count;
      }
      if (changes.enabled !== undefined) {
        toggleGuard.checked = changes.enabled.newValue !== false;
        updateStatusDot();
      }
      if (changes.shelfAlertEnabled !== undefined) {
        shelfToggle.checked = changes.shelfAlertEnabled.newValue !== false;
        updateStatusDot();
      }
      if (changes.shelfAlertVolume !== undefined) {
        const newVol = changes.shelfAlertVolume.newValue ?? 100;
        volumeSlider.value = newVol;
        volumeValEl.textContent = `${newVol}%`;
      }
      if (changes.shelfAlertInterval !== undefined) {
        intervalSelect.value = String(changes.shelfAlertInterval.newValue ?? 10);
      }
      if (changes.shelfCount !== undefined) {
        updateShelfDisplay(changes.shelfCount.newValue ?? 0);
      }
    }
  });
});
