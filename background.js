/**
 * Ozon PVZ: Turbo Assistant - Background Service Worker (Manifest V3)
 * Отвечает за создание и координацию Offscreen Document для фонового
 * воспроизведения звуковых сигналов без ограничений Autoplay,
 * а также навигацию к цепочке «Отправка → Ozon Полка».
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const DISPATCH_TARGET_URL = 'https://turbo-pvz.ozon.ru/outbound/selection';
let creatingOffscreenPromise = null;

/**
 * Проверка наличия уже открытого Offscreen Document
 */
async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    try {
      const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      return contexts && contexts.length > 0;
    } catch {
      // Игнорируем ошибку и переходим к следующей проверке
    }
  }

  // Fallback для более старых версий Chromium (< 116)
  if (typeof clients !== 'undefined' && clients.matchAll) {
    try {
      const targetUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
      const matchedClients = await clients.matchAll();
      return matchedClients.some(c => c.url === targetUrl);
    } catch {
      // Игнорируем ошибку
    }
  }

  return false;
}

/**
 * Гарантированное создание Offscreen Document с защитой от одновременных вызовов
 */
async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    throw new Error('chrome.offscreen API не поддерживается в данной версии браузера');
  }

  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Воспроизведение звуковых оповещений для полки отправки Турбо ПВЗ Ozon'
  });

  try {
    await creatingOffscreenPromise;
  } catch (err) {
    // Если документ уже был создан параллельно — это нормальная ситуация
    if (err && err.message && err.message.includes('Only a single offscreen document')) {
      return;
    }
    throw err;
  } finally {
    creatingOffscreenPromise = null;
  }
}

/**
 * Переход на страницу цепочки Отправка → Ozon Полка.
 * Если вкладка turbo-pvz.ozon.ru открыта — переводит фокус на нее и обновляет URL.
 * Если нет — открывает новую вкладку.
 */
async function openDispatchPage() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://turbo-pvz.ozon.ru/*', '*://*.turbo-pvz.ozon.ru/*']
    });

    if (tabs && tabs.length > 0) {
      const targetTab = tabs[0];
      await chrome.tabs.update(targetTab.id, {
        active: true,
        url: DISPATCH_TARGET_URL
      });

      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
      return { success: true, mode: 'focused_existing' };
    }
  } catch (err) {
    console.warn('[Ozon PVZ Turbo Assistant] Error focusing existing tab:', err);
  }

  try {
    const newTab = await chrome.tabs.create({ url: DISPATCH_TARGET_URL });
    return { success: true, mode: 'opened_new', tabId: newTab?.id };
  } catch (err) {
    console.error('[Ozon PVZ Turbo Assistant] Error opening new tab:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Прием сообщений от content-скрипта и popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Команда открытия страницы отправки
  if (message?.type === 'OPEN_DISPATCH_PAGE') {
    openDispatchPage().then(res => sendResponse(res));
    return true; // Держим канал открытым
  }

  // Команда воспроизведения звука
  if (message?.type === 'PLAY_CHIME') {
    (async () => {
      try {
        await ensureOffscreenDocument();

        const soundId = message.soundId || 'default';
        const volume = message.volume !== undefined ? message.volume : 100;

        // Отправляем команду в offscreen document
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_PLAY_CHIME',
          target: 'offscreen',
          soundId: soundId,
          volume: volume
        }, (res) => {
          // Если возникла задержка при инициализации слушателя в offscreen — повторяем один раз через 80мс
          if (chrome.runtime.lastError || !res?.played) {
            setTimeout(() => {
              chrome.runtime.sendMessage({
                type: 'OFFSCREEN_PLAY_CHIME',
                target: 'offscreen',
                soundId: soundId,
                volume: volume
              });
            }, 80);
          }
        });

        sendResponse({ success: true });
      } catch (err) {
        console.warn('[Ozon PVZ Turbo Assistant] Background audio dispatch error:', err);
        sendResponse({ success: false, error: err?.message });
      }
    })();

    return true; // Держим канал открытым для асинхронного ответа
  }
});
