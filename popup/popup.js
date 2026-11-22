/**
 * Ozon PVZ: Turbo Assistant — Popup Script (v2.1.0)
 * Управление защитой сканера, расширенными оповещениями об отправке,
 * Live Preview мерцания и темами оформления.
 * 
 * Разработчик: Saymon1337
 */

document.addEventListener('DOMContentLoaded', () => {
  // Элементы темы
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');

  // Вкладки
  const tabBtnMain = document.getElementById('tabBtnMain');
  const tabBtnAdvanced = document.getElementById('tabBtnAdvanced');
  const tabContentMain = document.getElementById('tabContentMain');
  const tabContentAdvanced = document.getElementById('tabContentAdvanced');
  const goToAdvancedBtn = document.getElementById('goToAdvancedBtn');

  // Модуль 1: Защита сканера
  const toggleGuard = document.getElementById('toggleGuard');
  const blockedCountEl = document.getElementById('blockedCount');
  const resetBtn = document.getElementById('resetBtn');
  const statusDot = document.getElementById('statusDot');

  // Модуль 2: Оповещение об отправке (Главный экран)
  const shelfToggle = document.getElementById('shelfToggle');
  const shelfCountEl = document.getElementById('shelfCount');
  const shelfBadgeEl = document.getElementById('shelfBadge');
  const openDispatchBtn = document.getElementById('openDispatchBtn');

  // Быстрые контролы (Главный экран)
  const volumeSliderQuick = document.getElementById('volumeSliderQuick');
  const volumeValQuick = document.getElementById('volumeValQuick');
  const quickTestSoundBtn = document.getElementById('quickTestSoundBtn');

  // Расширенные настройки: Звук
  const soundSelect = document.getElementById('soundSelect');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValEl = document.getElementById('volumeVal');
  const testSoundBtn = document.getElementById('testSoundBtn');

  // Расширенные настройки: Повторы
  const intervalSlider = document.getElementById('intervalSlider');
  const intervalValEl = document.getElementById('intervalVal');
  const repeatLimitSelect = document.getElementById('repeatLimitSelect');

  // Расширенные настройки: Мерцание плашки
  const animStyleSelect = document.getElementById('animStyleSelect');
  const animSpeedSlider = document.getElementById('animSpeedSlider');
  const animSpeedValEl = document.getElementById('animSpeedVal');
  const animIntensitySlider = document.getElementById('animIntensitySlider');
  const animIntensityValEl = document.getElementById('animIntensityVal');
  const liveBannerPreview = document.getElementById('liveBannerPreview');
  const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');

  let popupAudioCtx = null;
  let currentTheme = 'dark';

  // =========================================================================
  // ТЕМА ОФОРМЛЕНИЯ
  // =========================================================================
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

  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    chrome.storage.local.set({ theme: nextTheme });
  });

  // =========================================================================
  // ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
  // =========================================================================
  function switchTab(tabName) {
    if (tabName === 'advanced') {
      tabBtnMain.classList.remove('active');
      tabBtnAdvanced.classList.add('active');
      tabContentMain.classList.remove('active');
      tabContentAdvanced.classList.add('active');
    } else {
      tabBtnAdvanced.classList.remove('active');
      tabBtnMain.classList.add('active');
      tabContentAdvanced.classList.remove('active');
      tabContentMain.classList.add('active');
    }
  }

  tabBtnMain.addEventListener('click', () => switchTab('main'));
  tabBtnAdvanced.addEventListener('click', () => switchTab('advanced'));
  if (goToAdvancedBtn) {
    goToAdvancedBtn.addEventListener('click', () => switchTab('advanced'));
  }

  // =========================================================================
  // ИНТЕРАКТИВНЫЙ LIVE PREVIEW ПЛАШКИ
  // =========================================================================
  function updateLivePreview(style, speed, intensity) {
    if (!liveBannerPreview) return;

    liveBannerPreview.style.setProperty('--ota-anim-speed', `${speed}s`);
    liveBannerPreview.style.setProperty('--ota-anim-intensity', `${intensity / 100}`);

    liveBannerPreview.classList.remove(
      'ota-anim-pulse',
      'ota-anim-glow',
      'ota-anim-blink',
      'ota-anim-shake',
      'ota-anim-none'
    );
    liveBannerPreview.classList.add(`ota-anim-${style}`);
  }

  // =========================================================================
  // СТАТУС И ОТОБРАЖЕНИЕ ПОЛКИ
  // =========================================================================
  function updateShelfDisplay(count) {
    const num = Number(count) || 0;
    shelfCountEl.textContent = `${num} шт`;

    if (num > 0) {
      shelfCountEl.style.color = 'var(--ozon-magenta)';
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

  // =========================================================================
  // WEB AUDIO СИНТЕЗАТОР (FALLBACK ДЛЯ POPUP)
  // =========================================================================
  function playPopupChime(soundId, volumePercent) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!popupAudioCtx || popupAudioCtx.state === 'closed') {
        popupAudioCtx = new AudioContextClass();
      }

      const start = () => {
        try {
          const now = popupAudioCtx.currentTime;
          const vol = Math.max(0, Math.min(100, Number(volumePercent) || 100)) / 100;
          if (vol <= 0) return;

          const master = popupAudioCtx.createGain();
          master.gain.setValueAtTime(vol * 2.2, now);
          master.connect(popupAudioCtx.destination);

          // Простой приятный звук для предпрослушивания в случае отсутствия offscreen
          const osc1 = popupAudioCtx.createOscillator();
          const gain1 = popupAudioCtx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(587.33, now);
          gain1.gain.setValueAtTime(0.001, now);
          gain1.gain.linearRampToValueAtTime(0.8, now + 0.008);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
          osc1.connect(gain1);
          gain1.connect(master);
          osc1.start(now);
          osc1.stop(now + 0.23);

          const osc2 = popupAudioCtx.createOscillator();
          const gain2 = popupAudioCtx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(880.00, now + 0.16);
          gain2.gain.setValueAtTime(0.001, now + 0.16);
          gain2.gain.linearRampToValueAtTime(0.9, now + 0.168);
          gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
          osc2.connect(gain2);
          gain2.connect(master);
          osc2.start(now + 0.16);
          osc2.stop(now + 0.82);
        } catch (e) {
          console.warn('[Popup Audio] Synth error:', e);
        }
      };

      if (popupAudioCtx.state === 'suspended') {
        popupAudioCtx.resume().then(start).catch(() => { });
      } else {
        start();
      }
    } catch (e) {
      console.warn('[Popup Audio] Context error:', e);
    }
  }

  function playSelectedSound(soundId, volumePercent) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'PLAY_CHIME',
        soundId: soundId,
        volume: volumePercent
      }, (res) => {
        if (chrome.runtime.lastError || !res?.success) {
          playPopupChime(soundId, volumePercent);
        }
      });
    } else {
      playPopupChime(soundId, volumePercent);
    }
  }

  // =========================================================================
  // СИНХРОНИЗАЦИЯ С CHROME.STORAGE.LOCAL
  // =========================================================================

  // Слушаем прямое обновление счетчика сбоев от content.js
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'BLOCKED_COUNT_UPDATED') {
        const count = Number(msg.count) || 0;
        blockedCountEl.textContent = count;
      }
    });
  }

  // Загружаем сохраненные настройки
  chrome.storage.local.get(
    {
      enabled: true,
      blockedCount: 0,
      shelfAlertEnabled: true,
      shelfAlertVolume: 100,
      shelfAlertInterval: 10,
      shelfCount: 0,
      theme: 'dark',
      soundId: 'default',
      repeatLimit: 0,
      bannerAnimation: 'pulse',
      bannerSpeed: 1.4,
      bannerIntensity: 80
    },
    (data) => {
      applyTheme(data.theme || 'dark');

      // Модуль 1
      toggleGuard.checked = data.enabled !== false;
      blockedCountEl.textContent = Number(data.blockedCount) || 0;

      // Модуль 2
      shelfToggle.checked = data.shelfAlertEnabled !== false;
      updateShelfDisplay(data.shelfCount || 0);
      updateStatusDot();

      // Звук и громкость
      const vol = data.shelfAlertVolume !== undefined ? Number(data.shelfAlertVolume) : 100;
      volumeSlider.value = vol;
      volumeValEl.textContent = `${vol}%`;
      if (volumeSliderQuick) volumeSliderQuick.value = vol;
      if (volumeValQuick) volumeValQuick.textContent = `${vol}%`;

      const sid = data.soundId || 'default';
      soundSelect.value = sid;

      // Интервал и лимит повторов
      const interval = Number(data.shelfAlertInterval) || 10;
      intervalSlider.value = interval;
      intervalValEl.textContent = `${interval} мин`;

      const rLimit = Number(data.repeatLimit) || 0;
      repeatLimitSelect.value = String(rLimit);

      // Анимация плашки
      const bAnim = data.bannerAnimation || 'pulse';
      const bSpeed = Number(data.bannerSpeed) || 1.4;
      const bIntensity = Number(data.bannerIntensity) || 80;

      animStyleSelect.value = bAnim;
      animSpeedSlider.value = bSpeed;
      animSpeedValEl.textContent = `${bSpeed} сек`;
      animIntensitySlider.value = bIntensity;
      animIntensityValEl.textContent = `${bIntensity}%`;

      // Применяем параметры к Live Preview
      updateLivePreview(bAnim, bSpeed, bIntensity);
    }
  );

  // =========================================================================
  // ОБРАБОТЧИКИ СОБЫТИЙ ЭЛЕМЕНТОВ УПРАВЛЕНИЯ
  // =========================================================================

  // Тумблер защиты сканера
  toggleGuard.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: toggleGuard.checked });
    updateStatusDot();
  });

  // Сброс счетчика сбоев сканера
  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedCount: 0 });
    blockedCountEl.textContent = '0';
  });

  // Тумблер оповещения об отправке
  shelfToggle.addEventListener('change', () => {
    chrome.storage.local.set({ shelfAlertEnabled: shelfToggle.checked });
    updateStatusDot();
  });

  // Кнопка перехода к отправке
  openDispatchBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DISPATCH_PAGE' });
  });

  // Ползунок быстрой громкости на главной
  if (volumeSliderQuick) {
    volumeSliderQuick.addEventListener('input', () => {
      const vol = Number(volumeSliderQuick.value);
      volumeValQuick.textContent = `${vol}%`;
      volumeSlider.value = vol;
      volumeValEl.textContent = `${vol}%`;
      chrome.storage.local.set({ shelfAlertVolume: vol });
    });
  }

  // Кнопка быстрой проверки сигнала на главной
  if (quickTestSoundBtn) {
    quickTestSoundBtn.addEventListener('click', () => {
      playSelectedSound(soundSelect.value, Number(volumeSlider.value));
    });
  }

  // Ползунок громкости в расширенных настройках
  volumeSlider.addEventListener('input', () => {
    const vol = Number(volumeSlider.value);
    volumeValEl.textContent = `${vol}%`;
    if (volumeSliderQuick) volumeSliderQuick.value = vol;
    if (volumeValQuick) volumeValQuick.textContent = `${vol}%`;
    chrome.storage.local.set({ shelfAlertVolume: vol });
  });

  // Выбор звукового сигнала
  soundSelect.addEventListener('change', () => {
    const sid = soundSelect.value;
    chrome.storage.local.set({ soundId: sid });
    playSelectedSound(sid, Number(volumeSlider.value));
  });

  // Кнопка проверки звука в расширенных настройках
  testSoundBtn.addEventListener('click', () => {
    playSelectedSound(soundSelect.value, Number(volumeSlider.value));
  });

  // Ползунок интервала повтора
  intervalSlider.addEventListener('input', () => {
    const val = Number(intervalSlider.value) || 10;
    intervalValEl.textContent = `${val} мин`;
    chrome.storage.local.set({ shelfAlertInterval: val });
  });

  // Селектор лимита повторов
  repeatLimitSelect.addEventListener('change', () => {
    const val = Number(repeatLimitSelect.value) || 0;
    chrome.storage.local.set({ repeatLimit: val });
  });

  // Селектор эффекта анимации плашки
  animStyleSelect.addEventListener('change', () => {
    const style = animStyleSelect.value;
    const speed = Number(animSpeedSlider.value);
    const intensity = Number(animIntensitySlider.value);
    updateLivePreview(style, speed, intensity);
    chrome.storage.local.set({ bannerAnimation: style });
  });

  // Ползунок скорости анимации плашки
  animSpeedSlider.addEventListener('input', () => {
    const speed = Number(animSpeedSlider.value);
    animSpeedValEl.textContent = `${speed} сек`;
    const style = animStyleSelect.value;
    const intensity = Number(animIntensitySlider.value);
    updateLivePreview(style, speed, intensity);
    chrome.storage.local.set({ bannerSpeed: speed });
  });

  // Ползунок интенсивности анимации плашки
  animIntensitySlider.addEventListener('input', () => {
    const intensity = Number(animIntensitySlider.value);
    animIntensityValEl.textContent = `${intensity}%`;
    const style = animStyleSelect.value;
    const speed = Number(animSpeedSlider.value);
    updateLivePreview(style, speed, intensity);
    chrome.storage.local.set({ bannerIntensity: intensity });
  });

  // Кнопка «Сбросить по умолчанию»
  resetDefaultsBtn.addEventListener('click', () => {
    const defaults = {
      soundId: 'default',
      shelfAlertVolume: 100,
      shelfAlertInterval: 10,
      repeatLimit: 0,
      bannerAnimation: 'pulse',
      bannerSpeed: 1.4,
      bannerIntensity: 80
    };

    soundSelect.value = defaults.soundId;
    volumeSlider.value = defaults.shelfAlertVolume;
    volumeValEl.textContent = `${defaults.shelfAlertVolume}%`;
    if (volumeSliderQuick) volumeSliderQuick.value = defaults.shelfAlertVolume;
    if (volumeValQuick) volumeValQuick.textContent = `${defaults.shelfAlertVolume}%`;

    intervalSlider.value = defaults.shelfAlertInterval;
    intervalValEl.textContent = `${defaults.shelfAlertInterval} мин`;
    repeatLimitSelect.value = String(defaults.repeatLimit);

    animStyleSelect.value = defaults.bannerAnimation;
    animSpeedSlider.value = defaults.bannerSpeed;
    animSpeedValEl.textContent = `${defaults.bannerSpeed} сек`;
    animIntensitySlider.value = defaults.bannerIntensity;
    animIntensityValEl.textContent = `${defaults.bannerIntensity}%`;

    updateLivePreview(defaults.bannerAnimation, defaults.bannerSpeed, defaults.bannerIntensity);
    chrome.storage.local.set(defaults);
  });

  // =========================================================================
  // ЖИВОЕ ОБНОВЛЕНИЕ ПРИ ОТКРЫТОМ ОКНЕ POPUP
  // =========================================================================
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.theme !== undefined) {
      applyTheme(changes.theme.newValue);
    }
    if (changes.blockedCount !== undefined) {
      blockedCountEl.textContent = Number(changes.blockedCount.newValue) || 0;
    }
    if (changes.enabled !== undefined) {
      toggleGuard.checked = changes.enabled.newValue !== false;
      updateStatusDot();
    }
    if (changes.shelfAlertEnabled !== undefined) {
      shelfToggle.checked = changes.shelfAlertEnabled.newValue !== false;
      updateStatusDot();
    }
    if (changes.shelfCount !== undefined) {
      updateShelfDisplay(changes.shelfCount.newValue ?? 0);
    }
    if (changes.shelfAlertVolume !== undefined) {
      const vol = changes.shelfAlertVolume.newValue ?? 100;
      volumeSlider.value = vol;
      volumeValEl.textContent = `${vol}%`;
      if (volumeSliderQuick) volumeSliderQuick.value = vol;
      if (volumeValQuick) volumeValQuick.textContent = `${vol}%`;
    }
    if (changes.soundId !== undefined) {
      soundSelect.value = changes.soundId.newValue || 'default';
    }
    if (changes.shelfAlertInterval !== undefined) {
      const val = changes.shelfAlertInterval.newValue ?? 10;
      intervalSlider.value = val;
      intervalValEl.textContent = `${val} мин`;
    }
    if (changes.repeatLimit !== undefined) {
      repeatLimitSelect.value = String(changes.repeatLimit.newValue ?? 0);
    }
    if (changes.bannerAnimation !== undefined) {
      animStyleSelect.value = changes.bannerAnimation.newValue || 'pulse';
    }
    if (changes.bannerSpeed !== undefined) {
      const spd = Number(changes.bannerSpeed.newValue) || 1.4;
      animSpeedSlider.value = spd;
      animSpeedValEl.textContent = `${spd} сек`;
    }
    if (changes.bannerIntensity !== undefined) {
      const int = Number(changes.bannerIntensity.newValue) || 80;
      animIntensitySlider.value = int;
      animIntensityValEl.textContent = `${int}%`;
    }
    if (changes.bannerAnimation !== undefined || changes.bannerSpeed !== undefined || changes.bannerIntensity !== undefined) {
      const style = animStyleSelect.value;
      const speed = Number(animSpeedSlider.value);
      const intensity = Number(animIntensitySlider.value);
      updateLivePreview(style, speed, intensity);
    }
  });
});
