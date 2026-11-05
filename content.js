/**
 * PVZ Scanner Guard — Content Script (v1.0.2 Production)
 * Глобальный перехватчик паразитных вызовов DevTools/Ctrl+U
 */

(function () {
  'use strict';

  let isGuardActive = true;
  let pendingBlockCount = 0;
  let syncTimeout = null;

  // 1. Инициализация состояния
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
    if (e.code === 'F12' || e.key === 'F12') {
      return true;
    }

    // 2. Инспектор / Консоль / Выбор элемента
    // Windows/Linux: Ctrl + Shift + [I, J, C]
    // macOS: Cmd + Option + [I, J, C]
    const isDevToolsCombo = (isCtrl && isShift) || (isMeta && (isAlt || isShift));
    if (isDevToolsCombo) {
      const targetCodes = ['KeyI', 'KeyJ', 'KeyC'];
      const targetKeys = ['i', 'j', 'c', 'ш', 'о', 'с'];
      if (targetCodes.includes(e.code) || targetKeys.includes(e.key.toLowerCase())) {
        return true;
      }
    }

    // 3. Просмотр исходного кода:
    // Windows/Linux: Ctrl + U (без Alt/Shift)
    // macOS: Cmd + Option + U
    const isWinViewSource = isCtrl && !isMeta && !isAlt && !isShift;
    const isMacViewSource = isMeta && isAlt && !isShift;
    if (isWinViewSource || isMacViewSource) {
      if (e.code === 'KeyU' || e.key.toLowerCase() === 'u' || e.key.toLowerCase() === 'г') {
        return true;
      }
    }

    return false;
  }

  /**
   * Батчинг сохранения счетчика: исключает Race Condition при стрельбе сканера
   */
  function incrementBlockedCountBuffered() {
    pendingBlockCount++;

    if (syncTimeout) return;

    syncTimeout = setTimeout(() => {
      try {
        if (chrome.runtime?.id) {
          chrome.storage.local.get({ blockedCount: 0 }, (res) => {
            const newTotal = (res.blockedCount || 0) + pendingBlockCount;
            pendingBlockCount = 0;
            chrome.storage.local.set({ blockedCount: newTotal });
          });
        }
      } catch {
        // Контекст расширения перезагружен
      } finally {
        syncTimeout = null;
      }
    }, 300);
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

      incrementBlockedCountBuffered();
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

})();