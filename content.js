/**
 * Ozon PVZ: Turbo Assistant — Content Script (v2.0.0)
 * Модуль 1: PVZ Scanner Guard (Защита от сбоев сканера «Честный Знак»)
 * Модуль 2: Shelf & Dispatch Alert (Оповещение о товарах на отправку + умная синхронизация мульти-вкладок)
 *
 * Разработчик: Saymon1337
 */

(function () {
  'use strict';

  // =========================================================================
  // СТРОГАЯ ИЗОЛЯЦИЯ ДОМЕНА:
  // Расширение активно ИСКЛЮЧИТЕЛЬНО на turbo-pvz.ozon.ru
  // (а также на локальных тестовых страницах localhost / file:).
  // Сторонние вкладки (Google Таблицы, CRM, YouTube и т.д.) полностью изолированы!
  // =========================================================================
  const host = window.location.hostname || '';
  const isOzonPvz = host === 'turbo-pvz.ozon.ru' || host.endsWith('.turbo-pvz.ozon.ru');
  const isLocal = host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:';

  if (!isOzonPvz && !isLocal) {
    return;
  }

  // =========================================================================
  // МОДУЛЬ 1: PVZ SCANNER GUARD
  // Защита от паразитных вызовов DevTools при сканировании маркировки «Честный Знак»
  // =========================================================================

  let isGuardActive = true;

  // 1. Инициализация состояния защиты
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get({ enabled: true }, (data) => {
      isGuardActive = data.enabled ?? true;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.enabled !== undefined) {
        isGuardActive = changes.enabled.newValue;
      }
    });
  }

  /**
   * Определение хоткеев DevTools и исходного кода (кроссплатформенно)
   */
  function isDevToolsOrSourceShortcut(e) {
    const isCtrl = e.ctrlKey;
    const isMeta = e.metaKey; // Cmd на macOS
    const isShift = e.shiftKey;
    const isAlt = e.altKey;

    // 1. F12 (Все платформы)
    if (e.code === 'F12' || e.key === 'F12' || e.keyCode === 123 || e.which === 123) {
      return true;
    }

    // 2. Инспектор / Консоль / Выбор элемента
    // Windows/Linux: Ctrl + Shift + [I, J, C]
    // macOS: Cmd + Option + [I, J, C]
    const isDevToolsCombo = (isCtrl && isShift) || (isMeta && (isAlt || isShift));
    if (isDevToolsCombo) {
      const targetCodes = ['KeyI', 'KeyJ', 'KeyC'];
      const targetKeys = ['i', 'j', 'c', 'ш', 'о', 'с'];
      if (targetCodes.includes(e.code) || (e.key && targetKeys.includes(e.key.toLowerCase()))) {
        return true;
      }
    }

    // 3. Просмотр исходного кода:
    // Windows/Linux: Ctrl + U (без Alt/Shift)
    // macOS: Cmd + Option + U
    const isWinViewSource = isCtrl && !isMeta && !isAlt && !isShift;
    const isMacViewSource = isMeta && isAlt && !isShift;
    if (isWinViewSource || isMacViewSource) {
      if (e.code === 'KeyU' || (e.key && (e.key.toLowerCase() === 'u' || e.key.toLowerCase() === 'г'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Мгновенный учет и сохранение счетчика предотвращенных сбоев
   */
  function incrementBlockedCount() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get({ blockedCount: 0 }, (res) => {
          if (chrome.runtime?.lastError) return;
          const current = (typeof res?.blockedCount === 'number') ? res.blockedCount : (parseInt(res?.blockedCount, 10) || 0);
          const newTotal = current + 1;
          chrome.storage.local.set({ blockedCount: newTotal }, () => {
            // Мгновенно оповещаем открытый popup через runtime message
            try {
              if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({ type: 'BLOCKED_COUNT_UPDATED', count: newTotal }).catch(() => {});
              }
            } catch {}
          });
        });
      }
    } catch (e) {
      console.warn('[Turbo Assistant] Error saving blockedCount:', e);
    }
  }

  /**
   * Перехват на стадии Capture Phase
   */
  function interceptKeyboardEvent(e) {
    if (!isGuardActive) return;

    if (isDevToolsOrSourceShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      incrementBlockedCount();
    }
  }

  const listenerOptions = { capture: true, passive: false };

  window.addEventListener('keydown', interceptKeyboardEvent, listenerOptions);
  window.addEventListener('keyup', (e) => {
    if (isGuardActive && isDevToolsOrSourceShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, listenerOptions);


  // =========================================================================
  // МОДУЛЬ 2: SHELF & DISPATCH ALERT
  // Отслеживание товаров на отправку, громкий звук и двусторонняя синхронизация вкладок
  // =========================================================================

  (function initShelfAlert() {
    // В дочерних iframes фоновые звуки и плашки не запускаются во избежание дублирования
    if (window.self !== window.top) {
      return;
    }

    let isShelfAlertActive = true;
    let shelfAlertVolume = 100;
    let audioCtx = null;
    let currentShelfCount = 0;
    let lastSyncedStorageCount = -1;
    let hasInitializedCount = false;
    let isReloading = false;
    let isBannerDismissedForCount = 0;

    // Защита от частых перезагрузок (минимум 12 секунд между перезагрузками одной вкладки)
    let lastReloadTimestamp = 0;
    try {
      lastReloadTimestamp = Number(sessionStorage.getItem('ozon_last_auto_reload')) || 0;
    } catch { }

    /**
     * Безопасная фоновая перезагрузка свернутой вкладки
     * Обновляет устаревший интерфейс Ozon SPA без прерывания работы активной вкладки
     */
    function triggerBackgroundReload(reason) {
      if (isReloading) return;
      if (!document.hidden) return; // Никогда не перезагружаем активную вкладку, на которой работает оператор!

      const now = Date.now();
      if (now - lastReloadTimestamp < 12000) {
        return; // Защита от циклической перезагрузки
      }

      isReloading = true;
      lastReloadTimestamp = now;
      try {
        sessionStorage.setItem('ozon_last_auto_reload', String(now));
      } catch { }

      // Случайная задержка 600 - 1200 мс для мягкого распределения нагрузки на сеть
      const delay = 600 + Math.floor(Math.random() * 600);
      setTimeout(() => {
        if (document.hidden) {
          try {
            window.location.reload();
          } catch {
            window.location.href = window.location.href;
          }
        } else {
          isReloading = false;
        }
      }, delay);
    }

    // Синхронизация настроек второго модуля и межвкладочное автообновление
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(
        {
          shelfAlertEnabled: true,
          shelfAlertVolume: 100,
          shelfAlertInterval: 10,
          shelfCount: 0
        },
        (data) => {
          isShelfAlertActive = data.shelfAlertEnabled ?? true;
          shelfAlertVolume = Number(data.shelfAlertVolume) || 100;
        }
      );

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.shelfAlertEnabled !== undefined) {
          isShelfAlertActive = changes.shelfAlertEnabled.newValue;
          if (!isShelfAlertActive) {
            hideTopAlertBanner();
            restoreOriginalTitle();
          } else {
            scheduleCheck();
          }
        }

        if (changes.shelfAlertVolume !== undefined) {
          shelfAlertVolume = Number(changes.shelfAlertVolume.newValue) || 100;
        }

        // =====================================================================
        // ДВУСТОРОННЯЯ МУЛЬТИ-ВКЛАДОЧНАЯ СИНХРОНИЗАЦИЯ:
        // Обновляет свернутые вкладки:
        // 1. Когда товары отправлены (значок пропал, shelfCount = 0)
        // 2. Когда товары ПОЯВИЛИСЬ на полке (значок появился, shelfCount > 0)
        // =====================================================================
        if (changes.shelfCount !== undefined) {
          const newCount = Number(changes.shelfCount.newValue) || 0;
          const dispatchEl = findDispatchElement();
          const localBadge = dispatchEl ? getBadgeCount(dispatchEl) : 0;
          const currentLocal = Math.max(currentShelfCount, localBadge);

          // СЛУЧАЙ 1: Товары отправлены (стало 0)
          if (newCount === 0) {
            hideTopAlertBanner();
            restoreOriginalTitle();

            // Если вкладка свернута (в фоне), и в ней всё ещё висит старый счетчик (> 0):
            // Перезагружаем её в фоне, чтобы интерфейс очистился
            if (document.hidden && currentLocal > 0) {
              triggerBackgroundReload('dispatch_cleared');
            } else {
              currentShelfCount = 0;
            }
          }
          // СЛУЧАЙ 2: Появились новые товары на отправку (newCount > 0)
          else if (newCount > 0) {
            // Если вкладка активна (оператор сейчас в ней):
            if (!document.hidden) {
              showTopAlertBanner(newCount);
              currentShelfCount = newCount;
              updateDomBadgeVisual(dispatchEl, newCount);
            }
            // Если вкладка свернута (в фоне):
            else {
              // Если в свернутой вкладке локальный счетчик меньше, чем появилось (например, там еще 0):
              // Перезагружаем свернутую вкладку в фоне, чтобы Ozon подтянул свежие данные с сервера!
              if (currentLocal < newCount) {
                triggerBackgroundReload('goods_appeared');
              } else {
                currentShelfCount = newCount;
              }
            }
          }
        }
      });
    }

    /**
     * Визуальное обновление бейджа в боковом меню без необходимости полной перезагрузки
     */
    function updateDomBadgeVisual(dispatchEl, count) {
      if (!dispatchEl) return;
      const badgeEl = dispatchEl.querySelector('[class*="badge"], [class*="count"], [class*="counter"], [id*="badge"]');
      if (badgeEl) {
        badgeEl.textContent = count;
        badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
      }
    }

    // =========================================================================
    // БЕЗОПАСНАЯ ЛОГИКА МИГАНИЯ ЗАГОЛОВКА ВКЛАДКИ
    // =========================================================================
    let originalTitle = '';
    let titleBlinkInterval = null;
    let titleBlinkState = false;

    function cleanTitle(title) {
      if (!title) return '';
      return title.replace(/^\(🚨\s*ОТПРАВКА:[^)]+\)\s*/i, '').trim();
    }

    function saveOriginalTitle() {
      if (!titleBlinkInterval && document.title) {
        const cleaned = cleanTitle(document.title);
        if (cleaned) {
          originalTitle = cleaned;
        }
      }
    }

    try {
      const titleObserver = new MutationObserver(() => {
        saveOriginalTitle();
      });

      function attachTitleObserver() {
        saveOriginalTitle();
        const titleEl = document.querySelector('title');
        if (titleEl) {
          titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
        } else if (document.head) {
          titleObserver.observe(document.head, { childList: true, subtree: true });
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachTitleObserver, { once: true });
      } else {
        attachTitleObserver();
      }
    } catch { }

    /**
     * Разблокировка AudioContext при взаимодействиях оператора с экраном
     */
    function unlockAudioContext() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => { });
        }
      } catch { }
    }

    ['click', 'pointerdown', 'mousedown', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockAudioContext, { capture: true, passive: false });
    });

    /**
     * Полноэкранная красная пульсирующая плашка в самом верху экрана
     */
    function showTopAlertBanner(count) {
      if (isBannerDismissedForCount === count) {
        return;
      }

      let banner = document.getElementById('ozon-turbo-alert-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ozon-turbo-alert-banner';
        banner.innerHTML = `
          <style>
            #ozon-turbo-alert-banner {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              width: 100vw !important;
              z-index: 2147483647 !important;
              background: linear-gradient(90deg, #991b1b 0%, #dc2626 50%, #b91c1c 100%) !important;
              color: #ffffff !important;
              box-shadow: 0 4px 25px rgba(220, 38, 38, 0.9) !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              padding: 10px 24px !important;
              animation: ota-pulse 1.4s infinite alternate !important;
              box-sizing: border-box !important;
              border-bottom: 3px solid #fecaca !important;
            }
            @keyframes ota-pulse {
              0% { box-shadow: 0 4px 15px rgba(185, 28, 28, 0.7); filter: brightness(0.95); }
              100% { box-shadow: 0 6px 32px rgba(239, 68, 68, 1); filter: brightness(1.1); }
            }
            .ota-wrap {
              display: flex !important;
              align-items: center !important;
              justify-content: space-between !important;
              max-width: 1500px !important;
              margin: 0 auto !important;
            }
            .ota-info {
              display: flex !important;
              align-items: center !important;
              gap: 14px !important;
            }
            .ota-icon {
              font-size: 26px !important;
              line-height: 1 !important;
              animation: ota-bounce 0.9s infinite !important;
            }
            @keyframes ota-bounce {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.22); }
            }
            .ota-title {
              font-size: 16px !important;
              font-weight: 800 !important;
              letter-spacing: 0.3px !important;
              color: #ffffff !important;
              text-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
              display: flex !important;
              align-items: center !important;
            }
            .ota-badge {
              background: #ffffff !important;
              color: #b91c1c !important;
              padding: 3px 10px !important;
              border-radius: 6px !important;
              font-weight: 900 !important;
              margin: 0 6px !important;
              display: inline-block !important;
              font-size: 16px !important;
              box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
            }
            .ota-actions {
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
            }
            .ota-go-btn {
              background: #ffffff !important;
              color: #b91c1c !important;
              border: none !important;
              border-radius: 6px !important;
              padding: 8px 18px !important;
              font-size: 13px !important;
              font-weight: 700 !important;
              cursor: pointer !important;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
              transition: transform 0.15s, background-color 0.15s !important;
            }
            .ota-go-btn:hover {
              background: #fee2e2 !important;
              transform: scale(1.05) !important;
            }
            .ota-close-btn {
              background: rgba(0, 0, 0, 0.3) !important;
              color: #ffffff !important;
              border: 1px solid rgba(255, 255, 255, 0.5) !important;
              width: 30px !important;
              height: 30px !important;
              border-radius: 50% !important;
              font-size: 14px !important;
              cursor: pointer !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              transition: background-color 0.15s !important;
            }
            .ota-close-btn:hover {
              background: rgba(0, 0, 0, 0.6) !important;
            }
          </style>
          <div class="ota-wrap">
            <div class="ota-info">
              <span class="ota-icon">🚨</span>
              <span class="ota-title">ВНИМАНИЕ! НА ОТПРАВКЕ ТОВАРЫ:<span class="ota-badge" id="ota-count-val">${count} шт</span></span>
            </div>
            <div class="ota-actions">
              <button type="button" class="ota-go-btn" id="ota-btn-action">📦 Открыть «Отправку»</button>
              <button type="button" class="ota-close-btn" id="ota-btn-dismiss" title="Скрыть плашку">✕</button>
            </div>
          </div>
        `;

        document.documentElement.appendChild(banner);

        document.getElementById('ota-btn-action')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const dispatchEl = findDispatchElement();
          if (dispatchEl) {
            dispatchEl.click();
          }
        });

        document.getElementById('ota-btn-dismiss')?.addEventListener('click', (e) => {
          e.stopPropagation();
          isBannerDismissedForCount = count;
          banner.style.display = 'none';
        });
      } else {
        banner.style.display = 'block';
        const countBadge = document.getElementById('ota-count-val');
        if (countBadge) countBadge.textContent = `${count} шт`;
      }
    }

    function hideTopAlertBanner() {
      const banner = document.getElementById('ozon-turbo-alert-banner');
      if (banner) {
        banner.style.display = 'none';
      }
      isBannerDismissedForCount = 0;
    }

    /**
     * СИНТЕЗАТОР ГРОМКОГО КОЛОКОЛЬНОГО ЗВОНКА (D5 -> A5: 587 Гц -> 880 Гц)
     * С двойным усилением (Boost 2.5x), лимитером и богатыми обертонами.
     */
    function playTwoToneChime(volumePercent) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }

        const startSynthesis = () => {
          try {
            const now = audioCtx.currentTime;
            const vol = Math.max(0, Math.min(100, Number(volumePercent) || 100)) / 100;
            if (vol <= 0) return;

            const limiter = audioCtx.createDynamicsCompressor();
            limiter.threshold.setValueAtTime(-1.0, now);
            limiter.knee.setValueAtTime(6, now);
            limiter.ratio.setValueAtTime(12, now);
            limiter.attack.setValueAtTime(0.002, now);
            limiter.release.setValueAtTime(0.15, now);
            limiter.connect(audioCtx.destination);

            const masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(vol * 2.5, now);
            masterGain.connect(limiter);

            // Тон 1: Ре пятой октавы (D5 ~587 Гц)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.001, now);
            gain1.gain.linearRampToValueAtTime(0.85, now + 0.006);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            osc1.connect(gain1);
            gain1.connect(masterGain);
            osc1.start(now);
            osc1.stop(now + 0.23);

            // Обертон D6 (1174 Гц)
            const osc1b = audioCtx.createOscillator();
            const gain1b = audioCtx.createGain();
            osc1b.type = 'sine';
            osc1b.frequency.setValueAtTime(1174.66, now);
            gain1b.gain.setValueAtTime(0.001, now);
            gain1b.gain.linearRampToValueAtTime(0.45, now + 0.006);
            gain1b.gain.exponentialRampToValueAtTime(0.005, now + 0.20);
            osc1b.connect(gain1b);
            gain1b.connect(masterGain);
            osc1b.start(now);
            osc1b.stop(now + 0.21);

            // Тон 2: Ля пятой октавы (A5 ~880 Гц)
            const t2 = now + 0.16;
            const t2End = now + 0.82;

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(880.00, t2);
            gain2.gain.setValueAtTime(0.001, t2);
            gain2.gain.linearRampToValueAtTime(0.95, t2 + 0.006);
            gain2.gain.exponentialRampToValueAtTime(0.0001, t2End);
            osc2.connect(gain2);
            gain2.connect(masterGain);
            osc2.start(t2);
            osc2.stop(t2End);

            // Обертон A6 (1760 Гц)
            const osc2b = audioCtx.createOscillator();
            const gain2b = audioCtx.createGain();
            osc2b.type = 'sine';
            osc2b.frequency.setValueAtTime(1760.00, t2);
            gain2b.gain.setValueAtTime(0.001, t2);
            gain2b.gain.linearRampToValueAtTime(0.50, t2 + 0.006);
            gain2b.gain.exponentialRampToValueAtTime(0.0001, t2End - 0.10);
            osc2b.connect(gain2b);
            gain2b.connect(masterGain);
            osc2b.start(t2);
            osc2b.stop(t2End);

            // Высокий обертон E7 (2637 Гц)
            const osc2c = audioCtx.createOscillator();
            const gain2c = audioCtx.createGain();
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
            console.warn('[Ozon PVZ Turbo Assistant] Audio synthesis error:', err);
          }
        };

        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            if (audioCtx.state === 'running') {
              startSynthesis();
            }
          }).catch(() => { });
        } else if (audioCtx.state === 'running') {
          startSynthesis();
        }
      } catch (err) {
        console.warn('[Ozon PVZ Turbo Assistant] Web Audio error:', err);
      }
    }

    /**
     * Умный планировщик воспроизведения звука:
     * СВЕРНУТЫЕ ВКЛАДКИ ЗВУК НЕ ИЗДАЮТ (document.hidden === true).
     */
    function requestChimePlayback(volumePercent, isCountIncrease = false) {
      if (document.hidden) {
        return;
      }

      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        playTwoToneChime(volumePercent);
        return;
      }

      chrome.storage.local.get({
        shelfAlertEnabled: true,
        shelfAlertInterval: 10,
        lastGlobalSoundTime: 0
      }, (data) => {
        if (!data.shelfAlertEnabled) return;

        const now = Date.now();
        const intervalMinutes = Number(data.shelfAlertInterval) || 10;
        const intervalMs = intervalMinutes * 60 * 1000;
        const last = Number(data.lastGlobalSoundTime) || 0;

        // Поступили новые товары (увеличение количества)
        if (isCountIncrease) {
          if (now - last < 3500) {
            return;
          }
          chrome.storage.local.set({ lastGlobalSoundTime: now }, () => {
            playTwoToneChime(volumePercent);
          });
          return;
        }

        // Периодический повтор (шедулер)
        if (now - last >= intervalMs) {
          chrome.storage.local.set({ lastGlobalSoundTime: now }, () => {
            playTwoToneChime(volumePercent);
          });
        }
      });
    }

    /**
     * Мигание заголовка вкладки: (🚨 ОТПРАВКА: X шт) <название> <-> обычный заголовок
     */
    function startTitleBlink(count) {
      if (titleBlinkInterval) return;

      saveOriginalTitle();
      const realTitle = originalTitle || cleanTitle(document.title) || 'Турбо ПВЗ Ozon';
      originalTitle = realTitle;

      const alertTitle = `(🚨 ОТПРАВКА: ${count} шт) ${realTitle}`;
      titleBlinkState = false;

      titleBlinkInterval = setInterval(() => {
        if (!document.hidden) {
          restoreOriginalTitle();
          return;
        }

        titleBlinkState = !titleBlinkState;
        document.title = titleBlinkState ? alertTitle : originalTitle;
      }, 1000);
    }

    /**
     * Восстановление исходного заголовка вкладки
     */
    function restoreOriginalTitle() {
      if (!titleBlinkInterval) {
        return;
      }

      clearInterval(titleBlinkInterval);
      titleBlinkInterval = null;
      titleBlinkState = false;

      if (originalTitle) {
        document.title = originalTitle;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        restoreOriginalTitle();
      } else if (isShelfAlertActive && currentShelfCount > 0) {
        startTitleBlink(currentShelfCount);
      }
    });

    window.addEventListener('blur', () => {
      if (isShelfAlertActive && currentShelfCount > 0) {
        startTitleBlink(currentShelfCount);
      }
    });

    /**
     * Адаптивный поиск элемента навигации «Отправка» в боковом меню
     */
    function findDispatchElement() {
      const navContainers = document.querySelectorAll(
        'aside, nav, [role="navigation"], [class*="sidebar"], [class*="aside"], [class*="menu"], [class*="navbar"]'
      );

      for (const container of navContainers) {
        const items = container.querySelectorAll('a, button, li, [role="menuitem"], [class*="item"], div');
        for (const el of items) {
          if (el.children.length > 5) continue;
          const text = (el.innerText || el.textContent || '').trim();
          if (/^отправка\b/i.test(text) || (text.toLowerCase().includes('отправка') && text.length < 25)) {
            return el;
          }
        }
      }

      const globalLinks = document.querySelectorAll('a, button, li, [role="menuitem"]');
      for (const el of globalLinks) {
        const text = (el.innerText || el.textContent || '').trim();
        if (/^отправка\b/i.test(text) || (text.toLowerCase().includes('отправка') && text.length < 25)) {
          return el;
        }
      }

      const textNodes = document.querySelectorAll('span, p, div');
      for (const el of textNodes) {
        if (el.children.length > 2) continue;
        const text = (el.textContent || '').trim();
        if (/^отправка$/i.test(text)) {
          return el.closest('a, button, li, [role="menuitem"], [class*="item"]') || el.parentElement || el;
        }
      }

      return null;
    }

    /**
     * Поиск бейджа/индикатора с числом > 0
     */
    function getBadgeCount(dispatchEl) {
      if (!dispatchEl) return 0;

      const badgeSelectors = [
        '[class*="badge"]',
        '[class*="count"]',
        '[class*="counter"]',
        '[class*="indicator"]',
        '[class*="number"]',
        '[class*="pill"]',
        '[class*="tag"]',
        'sup',
        '[data-testid*="badge"]',
        '[data-testid*="count"]'
      ];

      const badgeEls = dispatchEl.querySelectorAll(badgeSelectors.join(', '));
      for (const b of badgeEls) {
        if (b.offsetParent === null && b.style.display === 'none') {
          continue;
        }
        const text = b.textContent.trim();
        const match = text.match(/(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > 0) return num;
        }
      }

      if (dispatchEl.parentElement) {
        const parentBadges = dispatchEl.parentElement.querySelectorAll(badgeSelectors.join(', '));
        for (const b of parentBadges) {
          if (b === dispatchEl) continue;
          if (b.offsetParent === null && b.style.display === 'none') continue;
          const text = b.textContent.trim();
          const match = text.match(/(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > 0) return num;
          }
        }
      }

      const allElements = [dispatchEl, ...dispatchEl.querySelectorAll('*')];
      for (const el of allElements) {
        if (el.offsetParent === null && el.style.display === 'none') continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (/^\d+\+?$/.test(text)) {
          const num = parseInt(text, 10);
          if (!isNaN(num) && num > 0 && num < 10000) {
            return num;
          }
        }
      }

      const fullText = (dispatchEl.innerText || dispatchEl.textContent || '').trim();
      const textMatch = fullText.match(/отправка[^\d]*(\d+)/i);
      if (textMatch) {
        const num = parseInt(textMatch[1], 10);
        if (!isNaN(num) && num > 0 && num < 10000) {
          return num;
        }
      }

      return 0;
    }

    /**
     * Проверка статуса полки отправки
     */
    function checkShelfStatus() {
      const dispatchEl = findDispatchElement();
      if (!dispatchEl) {
        return;
      }

      const count = getBadgeCount(dispatchEl);

      // Если вкладка свернута (в фоне):
      if (document.hidden) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get({ shelfCount: 0 }, (data) => {
            const globalShelfCount = Number(data.shelfCount) || 0;

            // 1. В активной вкладке товары уже отправлены (0), а в этой свернутой висит старый бейдж (> 0)
            if (globalShelfCount === 0 && count > 0) {
              hideTopAlertBanner();
              restoreOriginalTitle();
              currentShelfCount = 0;
              triggerBackgroundReload('sync_cleared');
              return;
            }

            // 2. В другой вкладке появились товары (> 0), а в этой свернутой локально еще 0 (устаревший DOM)
            if (globalShelfCount > 0 && count < globalShelfCount) {
              triggerBackgroundReload('sync_appeared');
              return;
            }

            applyShelfCount(count);
          });
          return;
        }
      }

      applyShelfCount(count);
    }

    /**
     * Применение проверенного количества отправлений к интерфейсу и хранилищу
     */
    function applyShelfCount(count) {
      const prevCount = currentShelfCount;
      currentShelfCount = count;

      if (!hasInitializedCount) {
        hasInitializedCount = true;
        if (count > 0 && isShelfAlertActive) {
          showTopAlertBanner(count);
          if (document.hidden) {
            startTitleBlink(count);
          } else {
            requestChimePlayback(shelfAlertVolume, true);
          }
        }
      } else {
        // Увеличение количества товаров (новые поступления на отправку)
        if (count > prevCount && count > 0) {
          if (isShelfAlertActive) {
            isBannerDismissedForCount = 0;
            showTopAlertBanner(count);
            if (document.hidden) {
              startTitleBlink(count);
            } else {
              requestChimePlayback(shelfAlertVolume, true);
            }
          }
        }
        // Количество не увеличилось, но товары лежат: проверяем шедулер
        else if (count > 0 && isShelfAlertActive) {
          showTopAlertBanner(count);
          if (document.hidden) {
            startTitleBlink(count);
          } else {
            requestChimePlayback(shelfAlertVolume, false);
          }
        } else {
          hideTopAlertBanner();
          restoreOriginalTitle();
        }
      }

      // Записываем shelfCount в хранилище ТОЛЬКО ЕСЛИ значение РЕАЛЬНО изменилось
      if (count !== lastSyncedStorageCount) {
        lastSyncedStorageCount = count;
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
            const updateData = { shelfCount: count };
            if (count === 0) {
              updateData.lastClearedTime = Date.now();
            }
            chrome.storage.local.set(updateData);
          }
        } catch { }
      }
    }

    let debounceTimer = null;
    function scheduleCheck() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkShelfStatus, 500);
    }

    function initObservers() {
      const target = document.body || document.documentElement;
      if (!target) {
        window.addEventListener('DOMContentLoaded', initObservers, { once: true });
        return;
      }

      try {
        const observer = new MutationObserver(() => {
          scheduleCheck();
        });

        observer.observe(target, {
          childList: true,
          subtree: true,
          characterData: true
        });
      } catch { }

      setInterval(checkShelfStatus, 3000);
      scheduleCheck();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initObservers, { once: true });
    } else {
      initObservers();
    }
  })();

})();
