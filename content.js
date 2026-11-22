/**
 * Ozon PVZ: Turbo Assistant — Content Script (v2.1.0)
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
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ВАЛИДАЦИИ КОНТЕКСТА
  // =========================================================================

  /**
   * Безопасная проверка валидности контекста расширения Chrome.
   * Предотвращает ошибки «Extension context invalidated» при обновлении/перезагрузке расширения.
   */
  function isExtensionValid() {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // =========================================================================
  // МОДУЛЬ 1: PVZ SCANNER GUARD
  // Защита от паразитных вызовов DevTools при сканировании маркировки «Честный Знак»
  // =========================================================================

  let isGuardActive = true;

  // 1. Инициализация состояния защиты
  if (isExtensionValid() && chrome.storage?.local) {
    try {
      chrome.storage.local.get({ enabled: true }, (data) => {
        if (chrome.runtime?.lastError || !isExtensionValid() || !data) return;
        isGuardActive = data.enabled ?? true;
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (!isExtensionValid()) return;
        if (area === 'local' && changes?.enabled !== undefined) {
          isGuardActive = changes.enabled.newValue;
        }
      });
    } catch { }
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
      if (isExtensionValid() && chrome.storage?.local) {
        chrome.storage.local.get({ blockedCount: 0 }, (res) => {
          if (chrome.runtime?.lastError || !isExtensionValid() || !res) return;
          const current = (typeof res?.blockedCount === 'number') ? res.blockedCount : (parseInt(res?.blockedCount, 10) || 0);
          const newTotal = current + 1;
          try {
            chrome.storage.local.set({ blockedCount: newTotal }, () => {
              if (chrome.runtime?.lastError) return;
              // Мгновенно оповещаем открытый popup через runtime message
              try {
                if (isExtensionValid() && chrome.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({ type: 'BLOCKED_COUNT_UPDATED', count: newTotal }, () => {
                    if (chrome.runtime?.lastError) { /* ignore */ }
                  });
                }
              } catch { }
            });
          } catch { }
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
  // Отслеживание товаров на отправку, настраиваемые звуки, мерцание и двусторонняя синхронизация
  // =========================================================================

  (function initShelfAlert() {
    // В дочерних iframes фоновые звуки и плашки не запускаются во избежание дублирования
    if (window.self !== window.top) {
      return;
    }

    let isShelfAlertActive = true;
    let shelfAlertVolume = 100;
    let currentSoundId = 'default';
    let shelfAlertIntervalMinutes = 10;
    let soundRepeatLimit = 0;
    let bannerAnimStyle = 'pulse';
    let bannerAnimSpeedSec = 1.4;
    let bannerAnimIntensityPct = 80;

    let audioCtx = null;
    let currentShelfCount = 0;
    let lastSyncedStorageCount = -1;
    let hasInitializedCount = false;
    let isReloading = false;
    let isBannerDismissedForCount = 0;
    let repeatSoundCounter = 0;
    let shelfStatusIntervalId = null;
    let domObserver = null;
    let titleObserver = null;
    let isTerminated = false;

    /**
     * Очистка таймеров и наблюдателей при инвалидации контекста расширения
     */
    function cleanupExtensionResources() {
      if (isTerminated) return;
      isTerminated = true;

      try {
        if (shelfStatusIntervalId) {
          clearInterval(shelfStatusIntervalId);
          shelfStatusIntervalId = null;
        }
      } catch { }

      try {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      } catch { }

      try {
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
      } catch { }

      try {
        if (titleObserver) {
          titleObserver.disconnect();
          titleObserver = null;
        }
      } catch { }

      try {
        restoreOriginalTitle();
      } catch { }
    }

    window.addEventListener('pagehide', cleanupExtensionResources);
    window.addEventListener('beforeunload', cleanupExtensionResources);

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
      if (isReloading || isTerminated) return;
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

    // Загрузка настроек второго модуля
    if (isExtensionValid() && chrome.storage?.local) {
      try {
        chrome.storage.local.get(
          {
            shelfAlertEnabled: true,
            shelfAlertVolume: 100,
            shelfAlertInterval: 10,
            shelfCount: 0,
            soundId: 'default',
            repeatLimit: 0,
            bannerAnimation: 'pulse',
            bannerSpeed: 1.4,
            bannerIntensity: 80
          },
          (data) => {
            if (chrome.runtime?.lastError || !isExtensionValid() || !data) return;
            isShelfAlertActive = data.shelfAlertEnabled ?? true;
            shelfAlertVolume = Number(data.shelfAlertVolume) || 100;
            currentSoundId = data.soundId || 'default';
            shelfAlertIntervalMinutes = Number(data.shelfAlertInterval) || 10;
            soundRepeatLimit = Number(data.repeatLimit) || 0;
            bannerAnimStyle = data.bannerAnimation || 'pulse';
            bannerAnimSpeedSec = Number(data.bannerSpeed) || 1.4;
            bannerAnimIntensityPct = Number(data.bannerIntensity) || 80;

            applyBannerCustomStyles();
          }
        );

        chrome.storage.onChanged.addListener((changes, area) => {
          if (!isExtensionValid() || area !== 'local' || !changes) return;

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

          if (changes.soundId !== undefined) {
            currentSoundId = changes.soundId.newValue || 'default';
          }

          if (changes.shelfAlertInterval !== undefined) {
            shelfAlertIntervalMinutes = Number(changes.shelfAlertInterval.newValue) || 10;
          }

          if (changes.repeatLimit !== undefined) {
            soundRepeatLimit = Number(changes.repeatLimit.newValue) || 0;
          }

          // Динамическое применение стилей мерцания без перезагрузки страницы
          if (changes.bannerAnimation !== undefined) {
            bannerAnimStyle = changes.bannerAnimation.newValue || 'pulse';
            applyBannerCustomStyles();
          }
          if (changes.bannerSpeed !== undefined) {
            bannerAnimSpeedSec = Number(changes.bannerSpeed.newValue) || 1.4;
            applyBannerCustomStyles();
          }
          if (changes.bannerIntensity !== undefined) {
            bannerAnimIntensityPct = Number(changes.bannerIntensity.newValue) || 80;
            applyBannerCustomStyles();
          }

          // Двусторонняя синхронизация полки между вкладками
          if (changes.shelfCount !== undefined) {
            const newCount = Number(changes.shelfCount.newValue) || 0;
            const dispatchEl = findDispatchElement();
            const localBadge = dispatchEl ? getBadgeCount(dispatchEl) : 0;
            const currentLocal = Math.max(currentShelfCount, localBadge);

            // СЛУЧАЙ 1: Товары отправлены (стало 0)
            if (newCount === 0) {
              hideTopAlertBanner();
              restoreOriginalTitle();
              repeatSoundCounter = 0;

              if (document.hidden && currentLocal > 0) {
                triggerBackgroundReload('dispatch_cleared');
              } else {
                currentShelfCount = 0;
              }
            }
            // СЛУЧАЙ 2: Появились новые товары на отправку (newCount > 0)
            else if (newCount > 0) {
              if (!document.hidden) {
                showTopAlertBanner(newCount);
                currentShelfCount = newCount;
                updateDomBadgeVisual(dispatchEl, newCount);
              } else {
                if (currentLocal < newCount) {
                  triggerBackgroundReload('goods_appeared');
                } else {
                  currentShelfCount = newCount;
                }
              }
            }
          }
        });
      } catch { }
    }
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
      titleObserver = new MutationObserver(() => {
        if (!isExtensionValid()) {
          cleanupExtensionResources();
          return;
        }
        saveOriginalTitle();
      });

      function attachTitleObserver() {
        if (isTerminated || !isExtensionValid()) return;
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
        if (!navigator.userActivation || navigator.userActivation.hasBeenActive) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new AudioContextClass();
          }
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => { });
          }
        }
      } catch { }
    }

    ['click', 'pointerdown', 'mousedown', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockAudioContext, { capture: true, passive: false });
    });

    /**
     * Переход на цепочку «Отправка → Ozon Полка»
     */
    function handleDispatchNavigation(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (isExtensionValid() && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_DISPATCH_PAGE' }, (resp) => {
            if (chrome.runtime?.lastError || !resp?.success) {
              window.location.href = 'https://turbo-pvz.ozon.ru/outbound/selection';
            }
          });
          return;
        } catch { }
      }

      window.location.href = 'https://turbo-pvz.ozon.ru/outbound/selection';
    }

    /**
     * Динамическое применение CSS-переменных и классов мерцания к плашке
     */
    function applyBannerCustomStyles() {
      const banner = document.getElementById('ozon-turbo-alert-banner');
      if (!banner) return;

      banner.style.setProperty('--ota-anim-speed', `${bannerAnimSpeedSec}s`);
      banner.style.setProperty('--ota-anim-intensity', `${bannerAnimIntensityPct / 100}`);

      banner.classList.remove(
        'ota-anim-pulse',
        'ota-anim-glow',
        'ota-anim-blink',
        'ota-anim-shake',
        'ota-anim-none'
      );
      banner.classList.add(`ota-anim-${bannerAnimStyle || 'pulse'}`);
    }

    /**
     * Полноэкранная плашка в самом верху экрана с настраиваемой анимацией
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
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              padding: 10px 24px !important;
              box-sizing: border-box !important;
              border-bottom: 3px solid #fecaca !important;
              box-shadow: 0 4px 25px rgba(220, 38, 38, 0.9) !important;
              transform: translateY(-100%);
              opacity: 0;
              transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease !important;
            }
            #ozon-turbo-alert-banner.ota-visible {
              transform: translateY(0);
              opacity: 1;
            }

            /* 1. Пульсация */
            @keyframes ota-pulse {
              0% {
                box-shadow: 0 4px calc(15px * var(--ota-anim-intensity, 0.8)) rgba(185, 28, 28, calc(0.7 * var(--ota-anim-intensity, 0.8)));
                filter: brightness(calc(1 - 0.06 * var(--ota-anim-intensity, 0.8)));
              }
              100% {
                box-shadow: 0 6px calc(32px * var(--ota-anim-intensity, 0.8)) rgba(239, 68, 68, var(--ota-anim-intensity, 0.8));
                filter: brightness(calc(1 + 0.16 * var(--ota-anim-intensity, 0.8)));
              }
            }
            #ozon-turbo-alert-banner.ota-anim-pulse {
              animation: ota-pulse var(--ota-anim-speed, 1.4s) infinite alternate ease-in-out !important;
            }

            /* 2. Мерцание рамки / свечение */
            @keyframes ota-glow {
              0%, 100% {
                box-shadow: 0 0 calc(8px * var(--ota-anim-intensity, 0.8)) rgba(254, 202, 202, calc(0.4 * var(--ota-anim-intensity, 0.8))), 0 4px 15px rgba(185, 28, 28, 0.7);
                border-bottom-color: #fecaca;
              }
              50% {
                box-shadow: 0 0 calc(30px * var(--ota-anim-intensity, 0.8)) rgba(255, 255, 255, calc(0.9 * var(--ota-anim-intensity, 0.8))), 0 6px 36px rgba(239, 68, 68, 1);
                border-bottom-color: #ffffff;
              }
            }
            #ozon-turbo-alert-banner.ota-anim-glow {
              animation: ota-glow var(--ota-anim-speed, 1.4s) infinite ease-in-out !important;
            }

            /* 3. Плавное мигание */
            @keyframes ota-blink {
              0%, 100% {
                opacity: 1;
              }
              50% {
                opacity: calc(1 - 0.6 * var(--ota-anim-intensity, 0.8));
              }
            }
            #ozon-turbo-alert-banner.ota-anim-blink {
              animation: ota-blink var(--ota-anim-speed, 1.4s) infinite ease-in-out !important;
            }

            /* 4. Легкое встряхивание */
            @keyframes ota-shake {
              0%, 100% {
                transform: translateY(0) rotate(0deg);
              }
              15% {
                transform: translateY(calc(-2px * var(--ota-anim-intensity, 0.8))) rotate(calc(-0.4deg * var(--ota-anim-intensity, 0.8)));
              }
              30% {
                transform: translateY(calc(2px * var(--ota-anim-intensity, 0.8))) rotate(calc(0.4deg * var(--ota-anim-intensity, 0.8)));
              }
              45% {
                transform: translateY(calc(-1.5px * var(--ota-anim-intensity, 0.8))) rotate(calc(-0.25deg * var(--ota-anim-intensity, 0.8)));
              }
              60% {
                transform: translateY(0) rotate(0deg);
              }
            }
            #ozon-turbo-alert-banner.ota-anim-shake {
              animation: ota-shake var(--ota-anim-speed, 1.4s) infinite ease-in-out !important;
            }

            /* 5. Без анимации */
            #ozon-turbo-alert-banner.ota-anim-none {
              animation: none !important;
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
            .ota-go-btn:active {
              transform: scale(0.98) !important;
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

        document.getElementById('ota-btn-action')?.addEventListener('click', handleDispatchNavigation);

        document.getElementById('ota-btn-dismiss')?.addEventListener('click', (e) => {
          e.stopPropagation();
          isBannerDismissedForCount = currentShelfCount || count;
          hideTopAlertBanner();
        });
      }

      applyBannerCustomStyles();

      const countBadge = document.getElementById('ota-count-val');
      if (countBadge) countBadge.textContent = `${count} шт`;

      banner.style.display = 'block';
      // Плавное появление
      requestAnimationFrame(() => {
        banner.classList.add('ota-visible');
      });
    }

    function hideTopAlertBanner() {
      const banner = document.getElementById('ozon-turbo-alert-banner');
      if (banner) {
        banner.classList.remove('ota-visible');
        setTimeout(() => {
          if (!banner.classList.contains('ota-visible')) {
            banner.style.display = 'none';
          }
        }, 350);
      }
      isBannerDismissedForCount = 0;
    }

    /**
     * Fallback колокольного звонка для прямого воспроизведения в DOM
     */
    function playFallbackChime(volumePercent) {
      try {
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
          return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }

        const now = audioCtx.currentTime;
        const vol = Math.max(0, Math.min(100, Number(volumePercent) || 100)) / 100;
        if (vol <= 0) return;

        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(vol * 2.0, now);
        masterGain.connect(audioCtx.destination);

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.36);
      } catch (err) {
        console.warn('[Ozon PVZ Turbo Assistant] Fallback audio error:', err);
      }
    }

    /**
     * Отправка команды воспроизведения выбранного звука в Background -> Offscreen Document
     */
    function triggerChime(volumePercent) {
      if (isExtensionValid() && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: 'PLAY_CHIME',
            soundId: currentSoundId || 'default',
            volume: volumePercent
          }, (resp) => {
            if (chrome.runtime?.lastError || (resp && !resp.success)) {
              playFallbackChime(volumePercent);
            }
          });
          return;
        } catch { }
      }

      playFallbackChime(volumePercent);
    }

    /**
     * Умный шедулер воспроизведения звука с контролем повторов
     */
    function requestChimePlayback(volumePercent, isCountIncrease = false) {
      if (document.hidden || isTerminated) {
        return;
      }

      if (!isExtensionValid() || !chrome.storage?.local) {
        triggerChime(volumePercent);
        return;
      }

      try {
        chrome.storage.local.get({
          shelfAlertEnabled: true,
          shelfAlertInterval: 10,
          shelfAlertVolume: 100,
          soundId: 'default',
          repeatLimit: 0,
          lastGlobalSoundTime: 0
        }, (data) => {
          if (chrome.runtime?.lastError || !isExtensionValid() || !data) {
            triggerChime(volumePercent);
            return;
          }

          if (!data.shelfAlertEnabled) return;

          const now = Date.now();
          const intervalMinutes = Number(data.shelfAlertInterval) || 10;
          const intervalMs = intervalMinutes * 60 * 1000;
          const last = Number(data.lastGlobalSoundTime) || 0;
          const limit = Number(data.repeatLimit) || 0;
          currentSoundId = data.soundId || 'default';
          const rawVol = Number(data.shelfAlertVolume);
          const vol = !isNaN(rawVol) ? rawVol : (Number(volumePercent) || 100);

          // Поступили новые товары (увеличение количества)
          if (isCountIncrease) {
            if (now - last < 3000) {
              return;
            }
            repeatSoundCounter = 1;
            try {
              chrome.storage.local.set({ lastGlobalSoundTime: now }, () => {
                if (chrome.runtime?.lastError) return;
                triggerChime(vol);
              });
            } catch {
              triggerChime(vol);
            }
            return;
          }

          // Периодический повтор с ограничением количества раз
          if (limit > 0 && repeatSoundCounter >= limit) {
            return;
          }

          if (now - last >= intervalMs) {
            repeatSoundCounter++;
            try {
              chrome.storage.local.set({ lastGlobalSoundTime: now }, () => {
                if (chrome.runtime?.lastError) return;
                triggerChime(vol);
              });
            } catch {
              triggerChime(vol);
            }
          }
        });
      } catch {
        triggerChime(volumePercent);
      }
    }

    /**
     * Мигание заголовка вкладки
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

    // =========================================================================
    // ПАРСИНГ DOM И ФИЛЬТРАЦИЯ ИНДИКАТОРОВ ОТПРАВКИ (ФАЗА 1)
    // Явно игнорирует блок «Доставка Ozon», исключает ложные срабатывания
    // =========================================================================

    /**
     * Проверка, является ли элемент конкретным пунктом/виджетом «Доставка Ozon» или доставки.
     * Не помечает общие структурные контейнеры (aside, nav, menu lists).
     */
    function isDeliveryBlock(el) {
      if (!el || el.nodeType !== 1) return false;

      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'BODY' || tag === 'HTML' || tag === 'ASIDE' || tag === 'NAV' || tag === 'MAIN' || tag === 'HEADER') {
        return false;
      }
      // Контейнеры со множеством детей — это контейнеры списка, а не единичный пункт меню
      if (el.children && el.children.length > 5) {
        return false;
      }

      const classNameStr = typeof el.className === 'string'
        ? el.className
        : (el.className && typeof el.className.baseVal === 'string' ? el.className.baseVal : '');

      const checkStr = [
        el.getAttribute?.('aria-label') || '',
        el.getAttribute?.('title') || '',
        el.getAttribute?.('href') || '',
        classNameStr,
        el.id || '',
        el.innerText || el.textContent || ''
      ].join(' ').toLowerCase();

      // Если в элементе есть прямое указание на отправку / полку — это НЕ блок доставки
      if (checkStr.includes('отправка') || checkStr.includes('полка') || checkStr.includes('outbound')) {
        return false;
      }

      // Явный фильтр: блоки доставки Ozon, курьерской доставки
      if (
        checkStr.includes('доставка ozon') ||
        checkStr.includes('доставка озон') ||
        checkStr.includes('ozon доставка') ||
        checkStr.includes('озон доставка') ||
        checkStr.includes('delivery') ||
        checkStr.includes('курьер') ||
        checkStr.includes('доставка')
      ) {
        return true;
      }

      return false;
    }

    /**
     * Проверка, находится ли элемент внутри родительского блока «Доставка Ozon».
     * Защищает от ложных срабатываний, не блокируя родительские навигационные панели (aside, nav).
     */
    function isInsideDeliveryBlock(el) {
      if (!el || el.nodeType !== 1) return false;

      const selfStr = (el.innerText || el.textContent || '').toLowerCase();
      if (selfStr.includes('отправка') || selfStr.includes('полка') || (el.getAttribute?.('href') || '').includes('outbound')) {
        return false;
      }

      let curr = el;
      while (curr) {
        const tag = (curr.tagName || '').toUpperCase();
        if (tag === 'BODY' || tag === 'HTML' || tag === 'ASIDE' || tag === 'NAV' || tag === 'MAIN' || tag === 'HEADER') {
          break; // Не поднимаемся выше меню/сайдбара в общие контейнеры страницы
        }
        if (curr.children && curr.children.length > 5) {
          break;
        }
        if (isDeliveryBlock(curr)) {
          return true;
        }
        curr = curr.parentElement;
      }
      return false;
    }

    /**
     * Строгая проверка текстовых индикаторов отправки («Отправка», «Ozon Полка», «Полка Ozon»)
     * с защитой от частичного совпадения текста с посторонними блоками (включая знаки пунктуации и скобки)
     */
    function isTargetDispatchText(rawText) {
      if (!rawText) return false;
      const text = rawText.trim().toLowerCase();

      // Отсекаем любые блоки доставки
      if (
        text.includes('доставка ozon') ||
        text.includes('доставка озон') ||
        text.includes('ozon доставка') ||
        text.includes('озон доставка') ||
        text.includes('курьер') ||
        (text.includes('доставка') && !text.includes('отправка') && !text.includes('полка'))
      ) {
        return false;
      }

      // Удаляем иконки/эмодзи и начальные спецсимволы
      const clean = text
        .replace(/^[\s\p{Emoji}\p{Symbol}🚚📦🔔•·\-_:]+/gu, '')
        // Удаляем замыкающие числа, единицы измерения (шт/товаров/ед) и обрамляющие скобки/двоеточия
        .replace(/[\s:(\[\-—–]*\d+[\s+)\]]*(?:шт\.?|товара?|товаров|заказа?|заказов|посыл(?:ок|ки|ка)|ед\.?|позици[йия])?[\s+)\]]*$/gui, '')
        .replace(/[\s:(\[\-—–]+$/gu, '')
        .trim();

      // Строгие целевые шаблоны
      if (/^отправка$/i.test(clean)) return true;
      if (/^отправка\s+товаров$/i.test(clean)) return true;
      if (/^(ozon\s*полка|озон\s*полка|полка\s*ozon|полка\s*озон)$/i.test(clean)) return true;
      if (/^полка$/i.test(clean)) return true;
      if (/^отправка\s*[—–\-·•]\s*(ozon\s*полка|озон\s*полка)/i.test(clean)) return true;
      if (/^отправка\s*\(\s*(ozon\s*полка|озон\s*полка)\s*\)/i.test(clean)) return true;

      // Проверка первой строки в многострочных блоках
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const firstClean = lines[0]
          .replace(/^[\s\p{Emoji}\p{Symbol}🚚📦🔔•·\-_:]+/gu, '')
          .replace(/[\s:(\[\-—–]*\d+[\s+)\]]*(?:шт\.?|товара?|товаров|заказа?|заказов|посыл(?:ок|ки|ка)|ед\.?|позици[йия])?[\s+)\]]*$/gui, '')
          .replace(/[\s:(\[\-—–]+$/gu, '')
          .trim();
        if (/^отправка$/i.test(firstClean) || /^(ozon\s*полка|озон\s*полка|полка\s*ozon|полка\s*озон)$/i.test(firstClean)) {
          return true;
        }
      }

      return false;
    }

    /**
     * Адаптивный поиск целевого элемента навигации «Отправка» в боковом меню
     */
    function findDispatchElement() {
      // 1. Поиск прямой ссылки по целевому URL цепочки отправки
      const outboundLinks = document.querySelectorAll('a[href*="/outbound"], a[href*="outbound"]');
      for (const link of outboundLinks) {
        if (!isInsideDeliveryBlock(link)) {
          return link;
        }
      }

      // 2. Поиск в навигационных меню и сайдбарах
      const navContainers = document.querySelectorAll(
        'aside, nav, [role="navigation"], [class*="sidebar"], [class*="aside"], [class*="menu"], [class*="navbar"]'
      );

      for (const container of navContainers) {
        const items = container.querySelectorAll('a, button, li, [role="menuitem"], [class*="item"]');
        for (const el of items) {
          if (isInsideDeliveryBlock(el)) continue;
          if (el.children.length > 6) continue;

          const text = (el.innerText || el.textContent || '').trim();
          if (isTargetDispatchText(text)) {
            return el;
          }
        }
      }

      // 3. Глобальный поиск ссылок и кнопок
      const globalLinks = document.querySelectorAll('a, button, li, [role="menuitem"]');
      for (const el of globalLinks) {
        if (isInsideDeliveryBlock(el)) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (isTargetDispatchText(text)) {
          return el;
        }
      }

      // 4. Текстовые узлы (fallback для кастомных компонентов Турбо ПВЗ)
      const textNodes = document.querySelectorAll('span, p, div');
      for (const el of textNodes) {
        if (isInsideDeliveryBlock(el)) continue;
        if (el.children.length > 2) continue;
        const text = (el.textContent || '').trim();
        if (isTargetDispatchText(text)) {
          const parentCandidate = el.closest('a, button, li, [role="menuitem"], [class*="item"]') || el.parentElement || el;
          if (!isInsideDeliveryBlock(parentCandidate)) {
            return parentCandidate;
          }
        }
      }

      return null;
    }

    /**
     * Поиск бейджа/индикатора с числом > 0 СТРОГО в пределах целевого блока отправки
     */
    function getBadgeCount(dispatchEl) {
      if (!dispatchEl || isInsideDeliveryBlock(dispatchEl)) return 0;

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

      function parseNumber(str) {
        if (!str) return 0;
        const match = str.trim().match(/(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > 0 && num < 100000) {
            return num;
          }
        }
        return 0;
      }

      function isElementVisible(el) {
        if (!el) return false;
        try {
          if (el.style?.display === 'none' || el.style?.visibility === 'hidden') return false;
          if (el.hidden) return false;
          return true;
        } catch {
          return true;
        }
      }

      // 1. Поиск бейджа СТРОГО внутри самого элемента отправки
      const badgeEls = dispatchEl.querySelectorAll(badgeSelectors.join(', '));
      for (const b of badgeEls) {
        if (isInsideDeliveryBlock(b)) continue;
        if (!isElementVisible(b)) continue;
        const count = parseNumber(b.textContent);
        if (count > 0) return count;
      }

      // 2. Если dispatchEl — это span/заголовок внутри своего конкретного li/menu-item:
      const itemWrapper = dispatchEl.closest('li, [role="menuitem"], .menu-item');
      if (itemWrapper && itemWrapper !== dispatchEl && !isInsideDeliveryBlock(itemWrapper)) {
        const wrapperText = (itemWrapper.innerText || '').toLowerCase();
        if (!wrapperText.includes('доставка') && (wrapperText.includes('отправка') || wrapperText.includes('полка'))) {
          const wrapperBadges = itemWrapper.querySelectorAll(badgeSelectors.join(', '));
          for (const b of wrapperBadges) {
            if (isInsideDeliveryBlock(b)) continue;
            if (!isElementVisible(b)) continue;
            const count = parseNumber(b.textContent);
            if (count > 0) return count;
          }
        }
      }

      // 3. Дочерние элементы самого dispatchEl на предмет одиночного числа
      const allElements = [dispatchEl, ...dispatchEl.querySelectorAll('*')];
      for (const el of allElements) {
        if (isInsideDeliveryBlock(el)) continue;
        if (!isElementVisible(el)) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (/^\d+\+?$/.test(text)) {
          const num = parseInt(text, 10);
          if (!isNaN(num) && num > 0 && num < 100000) {
            return num;
          }
        }
      }

      // 4. Текстовый regex строго по названию отправки: «Отправка: 3» или «Отправка 3»
      const fullText = (dispatchEl.innerText || dispatchEl.textContent || '').trim();
      const textMatch = fullText.match(/(?:отправка|полка)[^\d\wа-яё]*(\d+)/i);
      if (textMatch) {
        const num = parseInt(textMatch[1], 10);
        if (!isNaN(num) && num > 0 && num < 100000) {
          return num;
        }
      }

      return 0;
    }

    /**
     * Проверка статуса полки отправки
     */
    function checkShelfStatus() {
      if (isTerminated) return;
      if (!isExtensionValid()) {
        cleanupExtensionResources();
        return;
      }

      const dispatchEl = findDispatchElement();
      if (!dispatchEl) {
        return;
      }

      const count = getBadgeCount(dispatchEl);

      // Если вкладка свернута (в фоне):
      if (document.hidden) {
        if (isExtensionValid() && chrome.storage?.local) {
          try {
            chrome.storage.local.get({ shelfCount: 0 }, (data) => {
              if (chrome.runtime?.lastError || !isExtensionValid() || !data) {
                return;
              }

              const globalShelfCount = Number(data?.shelfCount) || 0;

              // 1. В активной вкладке товары уже отправлены (0), а в этой свернутой висит старый бейдж (> 0)
              if (globalShelfCount === 0 && count > 0) {
                hideTopAlertBanner();
                restoreOriginalTitle();
                currentShelfCount = 0;
                repeatSoundCounter = 0;
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
          } catch (err) {
            if (!isExtensionValid()) {
              cleanupExtensionResources();
              return;
            }
          }
        }
      }

      applyShelfCount(count);
    }

    /**
     * Применение проверенного количества отправлений к интерфейсу и хранилищу
     */
    function applyShelfCount(count) {
      if (isTerminated) return;

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
          repeatSoundCounter = 0;
        }
      }

      // Записываем shelfCount в хранилище ТОЛЬКО ЕСЛИ значение РЕАЛЬНО изменилось
      if (count !== lastSyncedStorageCount) {
        lastSyncedStorageCount = count;
        try {
          if (isExtensionValid() && chrome.storage?.local) {
            const updateData = { shelfCount: count };
            if (count === 0) {
              updateData.lastClearedTime = Date.now();
            }
            chrome.storage.local.set(updateData, () => {
              if (chrome.runtime?.lastError) { /* ignore */ }
            });
          }
        } catch { }
      }
    }

    let debounceTimer = null;
    function scheduleCheck() {
      if (isTerminated) return;
      if (!isExtensionValid()) {
        cleanupExtensionResources();
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkShelfStatus, 500);
    }

    function initObservers() {
      if (isTerminated || !isExtensionValid()) return;

      const target = document.body || document.documentElement;
      if (!target) {
        window.addEventListener('DOMContentLoaded', initObservers, { once: true });
        return;
      }

      try {
        domObserver = new MutationObserver(() => {
          scheduleCheck();
        });

        domObserver.observe(target, {
          childList: true,
          subtree: true,
          characterData: true
        });
      } catch { }

      shelfStatusIntervalId = setInterval(checkShelfStatus, 3000);
      scheduleCheck();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initObservers, { once: true });
    } else {
      initObservers();
    }
  })();

})();
