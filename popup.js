document.addEventListener('DOMContentLoaded', () => {
  const toggleGuard = document.getElementById('toggleGuard');
  const blockedCountEl = document.getElementById('blockedCount');
  const resetBtn = document.getElementById('resetBtn');
  const statusDot = document.getElementById('statusDot');

  // Читаем начальные значения
  chrome.storage.local.get({ enabled: true, blockedCount: 0 }, (data) => {
    toggleGuard.checked = data.enabled;
    blockedCountEl.textContent = data.blockedCount;
    updateStatusVisual(data.enabled);
  });

  // Переключение тумблера
  toggleGuard.addEventListener('change', () => {
    const isEnabled = toggleGuard.checked;
    chrome.storage.local.set({ enabled: isEnabled });
    updateStatusVisual(isEnabled);
  });

  // Сброс счетчика
  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedCount: 0 });
    blockedCountEl.textContent = '0';
  });

  // Обновление счетчика в реальном времени, если Popup открыт
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.blockedCount !== undefined) {
        blockedCountEl.textContent = changes.blockedCount.newValue;
      }
      if (changes.enabled !== undefined) {
        toggleGuard.checked = changes.enabled.newValue;
        updateStatusVisual(changes.enabled.newValue);
      }
    }
  });

  function updateStatusVisual(isEnabled) {
    if (isEnabled) {
      statusDot.classList.remove('off');
    } else {
      statusDot.classList.add('off');
    }
  }
});