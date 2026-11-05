/**
 * Ozon PVZ: Turbo Assistant - Background Service Worker (Manifest V3)
 * Отвечает за создание и координацию Offscreen Document для фонового
 * воспроизведения звуковых сигналов без ограничений Autoplay.
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
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
    justification: 'Воспроизведение колокольного оповещения для полки отправки Турбо ПВЗ Ozon'
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
 * Прием сообщений от content-скрипта и popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PLAY_CHIME') {
    (async () => {
      try {
        await ensureOffscreenDocument();

        // Отправляем команду в offscreen document
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_PLAY_CHIME',
          target: 'offscreen',
          volume: message.volume
        }, (res) => {
          // Если возникла задержка при инициализации слушателя в offscreen — повторяем один раз через 80мс
          if (chrome.runtime.lastError || !res?.played) {
            setTimeout(() => {
              chrome.runtime.sendMessage({
                type: 'OFFSCREEN_PLAY_CHIME',
                target: 'offscreen',
                volume: message.volume
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
