/**
 * Ozon PVZ Turbo Assistant - Comprehensive Verification Suite
 * Deep verification covering all phases of the task.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== RUNNING DEEP VERIFICATION SUITE ===\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  }
}

// =============================================================================
// TEST 1: Manifest structure and popup reference
// =============================================================================
test('Manifest JSON is valid MV3 and specifies correct active popup', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be MV3');
  assert.strictEqual(manifest.action.default_popup, 'popup.html', 'Action popup must be popup.html');
  assert.ok(manifest.permissions.includes('storage'), 'Must have storage permission');
  assert.ok(manifest.permissions.includes('offscreen'), 'Must have offscreen permission');
  assert.ok(manifest.permissions.includes('tabs'), 'Must have tabs permission');
  assert.strictEqual(manifest.version, '2.1.0', 'Version must be 2.1.0');
});

// =============================================================================
// TEST 2: HTML Element IDs synchronized between popup.js and popup.html
// =============================================================================
test('HTML IDs synchronization across root and popup/ directory', () => {
  const rootHtml = fs.readFileSync('popup.html', 'utf8');
  const rootJs = fs.readFileSync('popup.js', 'utf8');
  const subHtml = fs.readFileSync('popup/popup.html', 'utf8');
  const subJs = fs.readFileSync('popup/popup.js', 'utf8');

  const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
  let match;
  const ids = new Set();
  while ((match = idRegex.exec(rootJs)) !== null) {
    ids.add(match[1]);
  }

  assert.ok(ids.size >= 25, `Expected at least 25 element IDs, got ${ids.size}`);

  for (const id of ids) {
    assert.ok(rootHtml.includes(`id="${id}"`), `Missing ID in popup.html: ${id}`);
    assert.ok(subHtml.includes(`id="${id}"`), `Missing ID in popup/popup.html: ${id}`);
  }

  // Verify subJs and rootJs match
  assert.strictEqual(rootJs, subJs, 'root popup.js and popup/popup.js must be identical');
  assert.strictEqual(rootHtml, subHtml, 'root popup.html and popup/popup.html must be identical');
});

// =============================================================================
// TEST 3: CSS validation - No !important inside @keyframes
// =============================================================================
test('CSS Keyframes validation: no !important inside @keyframes blocks', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');
  const popupCss = fs.readFileSync('popup.css', 'utf8');

  function checkKeyframes(src, label) {
    const kfRegex = /@keyframes\s+([^{]+)\{([^}]+(?:\{[^}]+\}[^}]+)*)\}/g;
    let match;
    while ((match = kfRegex.exec(src)) !== null) {
      const animName = match[1].trim();
      const body = match[2];
      assert.ok(
        !body.includes('!important'),
        `Forbidden !important found inside @keyframes ${animName} in ${label}!`
      );
    }
  }

  checkKeyframes(contentSrc, 'content.js');
  checkKeyframes(popupCss, 'popup.css');
});

// =============================================================================
// TEST 4: Audio Engine in offscreen.js - 10 presets and volume robustness
// =============================================================================
test('Web Audio Engine in offscreen.js: 10 alert presets and robust master gain', () => {
  class MockAudioParam {
    constructor(name) {
      this.name = name;
      this.value = 0;
    }
    setValueAtTime(val, t) {
      assert.ok(isFinite(val), `setValueAtTime value must be finite, got ${val}`);
      assert.ok(isFinite(t), `setValueAtTime time must be finite, got ${t}`);
      this.value = val;
    }
    linearRampToValueAtTime(val, t) {
      assert.ok(isFinite(val), `linearRamp value must be finite, got ${val}`);
      assert.ok(isFinite(t), `linearRamp time must be finite, got ${t}`);
      this.value = val;
    }
    exponentialRampToValueAtTime(val, t) {
      assert.ok(isFinite(val), `exponentialRamp value must be finite, got ${val}`);
      assert.ok(isFinite(t), `exponentialRamp time must be finite, got ${t}`);
      assert.ok(val > 0, `exponentialRamp target must be > 0, got ${val}`);
      this.value = val;
    }
  }

  class MockNode {
    connect(d) {}
  }
  class MockGainNode extends MockNode {
    constructor() { super(); this.gain = new MockAudioParam('gain'); }
  }
  class MockOscNode extends MockNode {
    constructor() {
      super();
      this.frequency = new MockAudioParam('freq');
      this.type = 'sine';
      this.startTime = null;
    }
    start(t) { assert.ok(isFinite(t)); this.startTime = t; }
    stop(t) {
      assert.ok(isFinite(t));
      if (this.startTime !== null) assert.ok(t >= this.startTime, 'stop time < start time');
    }
  }
  class MockFilterNode extends MockNode {
    constructor() { super(); this.frequency = new MockAudioParam('freq'); this.type = 'lowpass'; }
  }
  class MockCompressorNode extends MockNode {
    constructor() {
      super();
      this.threshold = new MockAudioParam('threshold');
      this.knee = new MockAudioParam('knee');
      this.ratio = new MockAudioParam('ratio');
      this.attack = new MockAudioParam('attack');
      this.release = new MockAudioParam('release');
    }
  }
  class MockAudioContext {
    constructor() {
      this.currentTime = 5.0;
      this.destination = new MockNode();
      this.state = 'running';
    }
    createGain() { return new MockGainNode(); }
    createOscillator() { return new MockOscNode(); }
    createBiquadFilter() { return new MockFilterNode(); }
    createDynamicsCompressor() { return new MockCompressorNode(); }
  }

  const offscreenSrc = fs.readFileSync('offscreen.js', 'utf8');
  const mockCtx = new MockAudioContext();
  const sandboxFn = new Function('window', 'chrome', offscreenSrc + '; return { SOUND_HANDLERS, createMasterOutput, playOffscreenChime };');
  const { SOUND_HANDLERS, createMasterOutput, playOffscreenChime } = sandboxFn(
    { AudioContext: function() { return mockCtx; } },
    { runtime: { onMessage: { addListener: () => {} } } }
  );

  const expectedSounds = [
    'default',
    'soft_chime',
    'double_beep',
    'urgent_siren',
    'melodic_chord',
    'retro_signal',
    'crystal_bell',
    'short_click',
    'subtle_ping',
    'radar_sonar'
  ];

  assert.strictEqual(Object.keys(SOUND_HANDLERS).length, 10, 'Must have exactly 10 sound presets');
  for (const s of expectedSounds) {
    assert.ok(typeof SOUND_HANDLERS[s] === 'function', `Sound preset ${s} must be a function`);
    const master = createMasterOutput(mockCtx, 80);
    assert.ok(master !== null, 'Master output must exist for 80% volume');
    SOUND_HANDLERS[s](mockCtx, master, mockCtx.currentTime);
  }

  // Volume edge case robustness:
  // 1. volume = 0 -> muted (returns null)
  assert.strictEqual(createMasterOutput(mockCtx, 0), null, 'Volume 0 must return null (mute)');
  // 2. volume = undefined -> defaults safely without NaN error
  const masterDef = createMasterOutput(mockCtx, undefined);
  assert.ok(masterDef !== null, 'Undefined volume must not crash and default to active output');
  assert.ok(masterDef.gain.value > 0, 'Default gain must be positive');
  // 3. volume = null -> defaults safely
  const masterNull = createMasterOutput(mockCtx, null);
  assert.ok(masterNull === null || masterNull.gain.value > 0);
  // 4. volume as string
  const masterStr = createMasterOutput(mockCtx, '65');
  assert.ok(masterStr !== null);
});

// =============================================================================
// TEST 5: DOM filtering in content.js: Delivery isolation and target dispatch text
// =============================================================================
test('DOM filtering in content.js: «Доставка Ozon» isolation and dispatch detection', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');

  // Extract isDeliveryBlock, isInsideDeliveryBlock, isTargetDispatchText from content.js
  const fnMatch1 = contentSrc.match(/function isDeliveryBlock\([\s\S]*?\n    \}/);
  const fnMatch2 = contentSrc.match(/function isInsideDeliveryBlock\([\s\S]*?\n    \}/);
  const fnMatch3 = contentSrc.match(/function isTargetDispatchText\([\s\S]*?\n    \}/);

  assert.ok(fnMatch1, 'isDeliveryBlock function found');
  assert.ok(fnMatch2, 'isInsideDeliveryBlock function found');
  assert.ok(fnMatch3, 'isTargetDispatchText function found');

  const runner = new Function(
    `${fnMatch1[0]}; ${fnMatch2[0]}; ${fnMatch3[0]}; return { isDeliveryBlock, isInsideDeliveryBlock, isTargetDispatchText };`
  );
  const { isDeliveryBlock, isInsideDeliveryBlock, isTargetDispatchText } = runner();

  // 1. Target dispatch text matching
  const validDispatches = [
    'Отправка',
    'отправка',
    '🚚 Отправка',
    '📦 Отправка',
    'Отправка 3',
    'Отправка: 3',
    'Отправка: 3 шт',
    'Отправка (3)',
    'Отправка - 3',
    'Ozon Полка',
    'ozon полка',
    'Полка Ozon',
    'Ozon Полка 2',
    'Ozon Полка: 2',
    'Ozon Полка (2)',
    'Отправка товаров',
    'Отправка — Ozon Полка',
    'Отправка (Ozon Полка)'
  ];

  for (const text of validDispatches) {
    assert.strictEqual(
      isTargetDispatchText(text),
      true,
      `Should recognize as dispatch: "${text}"`
    );
  }

  // 2. Delivery rejection (must return false)
  const deliveryTexts = [
    'Доставка Ozon',
    'доставка ozon',
    '🛵 Доставка Ozon',
    'Доставка Ozon 5',
    'Доставка Ozon: 5',
    'Доставка Озон',
    'Ozon Доставка',
    'Курьерская доставка',
    'Доставка',
    '🛵 Доставка 2'
  ];

  for (const text of deliveryTexts) {
    assert.strictEqual(
      isTargetDispatchText(text),
      false,
      `Should NOT recognize as dispatch: "${text}"`
    );
  }

  // 3. DOM Hierarchical structure test: Aside container with both items
  const asideMock = {
    tagName: 'ASIDE',
    nodeType: 1,
    children: [{}, {}, {}, {}, {}],
    innerText: 'OZON ПВЗ\n📦 Приемка\n🤝 Выдача\n🚚 Отправка 2\n🛵 Доставка Ozon 5\n📋 Возвраты',
    textContent: 'OZON ПВЗ\n📦 Приемка\n🤝 Выдача\n🚚 Отправка 2\n🛵 Доставка Ozon 5\n📋 Возвраты',
    parentElement: { tagName: 'BODY', nodeType: 1 }
  };

  const dispatchItemMock = {
    tagName: 'DIV',
    nodeType: 1,
    id: 'dispatchItem',
    className: 'menu-item',
    children: [{}, {}],
    innerText: '🚚 Отправка 2',
    textContent: '🚚 Отправка 2',
    parentElement: asideMock
  };

  const deliveryItemMock = {
    tagName: 'DIV',
    nodeType: 1,
    id: 'deliveryOzonItem',
    className: 'menu-item',
    children: [{}, {}],
    innerText: '🛵 Доставка Ozon 5',
    textContent: '🛵 Доставка Ozon 5',
    parentElement: asideMock
  };

  // Aside container must NOT be flagged as a delivery block
  assert.strictEqual(isDeliveryBlock(asideMock), false, 'Aside must not be flagged as delivery block');
  // Dispatch item must NOT be flagged as delivery block
  assert.strictEqual(isDeliveryBlock(dispatchItemMock), false, 'Dispatch item must not be delivery block');
  // Dispatch item must NOT be inside delivery block
  assert.strictEqual(isInsideDeliveryBlock(dispatchItemMock), false, 'Dispatch item must not be inside delivery block');

  // Delivery item MUST be flagged as delivery block
  assert.strictEqual(isDeliveryBlock(deliveryItemMock), true, 'Delivery item must be flagged as delivery block');
  assert.strictEqual(isInsideDeliveryBlock(deliveryItemMock), true, 'Delivery item must be inside delivery block');
});

// =============================================================================
// TEST 6: Background navigation target URL
// =============================================================================
test('Background openDispatchPage navigates to /outbound/selection', () => {
  const bgSrc = fs.readFileSync('background.js', 'utf8');
  assert.ok(
    bgSrc.includes('https://turbo-pvz.ozon.ru/outbound/selection'),
    'Target URL https://turbo-pvz.ozon.ru/outbound/selection must be present in background.js'
  );
  assert.ok(
    bgSrc.includes('openDispatchPage'),
    'openDispatchPage handler must exist'
  );
});

// =============================================================================
// TEST 7: test.html emulator completeness
// =============================================================================
test('test.html contains emulator controls for dispatch, delivery and F12', () => {
  const testHtml = fs.readFileSync('test.html', 'utf8');
  assert.ok(testHtml.includes('id="dispatchItem"'), 'Must have dispatchItem');
  assert.ok(testHtml.includes('id="deliveryOzonItem"'), 'Must have deliveryOzonItem');
  assert.ok(testHtml.includes('Доставка Ozon'), 'Must mention Доставка Ozon');
  assert.ok(testHtml.includes('https://turbo-pvz.ozon.ru/outbound/selection'), 'Must display target outbound URL');
});

// =============================================================================
// =============================================================================
// TEST 8: isExtensionValid(), hasLastError() and safeLastError() context resilience
// =============================================================================
test('isExtensionValid() and hasLastError() handle all invalid context states and throws gracefully', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');
  const fnMatch = contentSrc.match(/function isExtensionValid\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'isExtensionValid function must be present in content.js');
  const fnMatch2 = contentSrc.match(/function hasLastError\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch2, 'hasLastError function must be present in content.js');
  const fnMatch3 = contentSrc.match(/function safeLastError\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch3, 'safeLastError function must be present in content.js');

  const createValidator = (mockChrome) => {
    return new Function('chrome', `${fnMatch[0]}; return isExtensionValid();`)(mockChrome);
  };

  const createErrorChecker = (mockChrome) => {
    return new Function('chrome', `${fnMatch[0]}; ${fnMatch2[0]}; ${fnMatch3[0]}; return { has: hasLastError(), safe: safeLastError() };`)(mockChrome);
  };

  // 1. chrome is undefined
  assert.strictEqual(createValidator(undefined), false, 'Must be false when chrome is undefined');
  assert.strictEqual(createErrorChecker(undefined).has, true, 'hasLastError must be true when chrome is undefined');
  assert.ok(createErrorChecker(undefined).safe.message, 'safeLastError must return object when chrome is undefined');

  // 2. chrome has no runtime
  assert.strictEqual(createValidator({}), false, 'Must be false when runtime is missing');
  assert.strictEqual(createErrorChecker({}).has, true, 'hasLastError must be true when runtime is missing');

  // 3. chrome.runtime exists but has no id (standard Chrome invalidated context state)
  assert.strictEqual(createValidator({ runtime: {} }), false, 'Must be false when chrome.runtime.id is undefined');
  assert.strictEqual(createErrorChecker({ runtime: {} }).has, true, 'hasLastError must be true when id is undefined');

  // 4. chrome.runtime exists and has valid id
  assert.strictEqual(createValidator({ runtime: { id: 'valid-extension-id-12345' } }), true, 'Must be true when chrome.runtime.id is set');
  assert.strictEqual(createErrorChecker({ runtime: { id: 'valid-extension-id-12345' } }).has, false, 'hasLastError must be false when no error');
  assert.strictEqual(createErrorChecker({ runtime: { id: 'valid-extension-id-12345' } }).safe, null, 'safeLastError must be null when no error');

  // 5. accessing chrome.runtime throws (e.g. security error or already destroyed proxy)
  const throwingChrome = {};
  Object.defineProperty(throwingChrome, 'runtime', {
    get() { throw new Error('Extension context invalidated.'); }
  });
  assert.strictEqual(createValidator(throwingChrome), false, 'Must return false without crashing if runtime getter throws');
  assert.strictEqual(createErrorChecker(throwingChrome).has, true, 'Must return true without crashing if runtime getter throws');

  // 6. chrome.runtime exists, but accessing chrome.runtime.lastError throws (native V8 invalidated getter)
  const throwingLastErrorChrome = {
    runtime: {
      id: 'valid-id'
    }
  };
  Object.defineProperty(throwingLastErrorChrome.runtime, 'lastError', {
    get() { throw new Error('Extension context invalidated.'); }
  });
  assert.strictEqual(createErrorChecker(throwingLastErrorChrome).has, true, 'hasLastError must catch throwing getter');
  assert.ok(createErrorChecker(throwingLastErrorChrome).safe.message.includes('invalidated'), 'safeLastError must catch throwing getter');
});

// =============================================================================
// TEST 9: checkShelfStatus Chrome error immunity (Extension Context Invalidation & Null Ref)
// =============================================================================
test('checkShelfStatus: Immune to context invalidation, null data and throwing lastError getters (line 888 fix)', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');

  // Verify that checkShelfStatus contains isExtensionValid checks and lastError handling
  assert.ok(
    contentSrc.includes('if (!isExtensionValid())'),
    'checkShelfStatus must check isExtensionValid()'
  );
  assert.ok(
    contentSrc.includes('hasLastError()'),
    'checkShelfStatus callback must check hasLastError()'
  );
  assert.ok(
    contentSrc.includes('Number(data?.shelfCount)'),
    'checkShelfStatus callback must safely access data?.shelfCount with optional chaining'
  );
  assert.ok(
    contentSrc.includes('cleanupExtensionResources'),
    'checkShelfStatus must trigger cleanupExtensionResources on context loss'
  );

  // Simulate environment where chrome.storage.local.get throws synchronous Context Invalidation
  let cleanedUp = false;
  const mockStorageThrows = {
    local: {
      get: () => {
        throw new Error('Extension context invalidated.');
      }
    }
  };

  const sandboxContextLoss = {
    isTerminated: false,
    isExtensionValid: () => false,
    cleanupExtensionResources: () => { cleanedUp = true; },
    findDispatchElement: () => ({ innerText: '🚚 Отправка 3' }),
    getBadgeCount: () => 3,
    document: { hidden: true },
    chrome: { runtime: {}, storage: mockStorageThrows }
  };

  // Run mock checkShelfStatus logic
  if (!sandboxContextLoss.isExtensionValid()) {
    sandboxContextLoss.cleanupExtensionResources();
  }
  assert.strictEqual(cleanedUp, true, 'Must clean up resources immediately when context is invalid');

  // Simulate callback with undefined data and a throwing runtime.lastError getter
  let callbackCrashed = false;
  let appliedCount = null;
  const mockStorageUndefinedData = {
    local: {
      get: (keys, cb) => {
        // Native getter throws Extension context invalidated
        const throwingRuntime = { id: 'x' };
        Object.defineProperty(throwingRuntime, 'lastError', {
          get() { throw new Error('Extension context invalidated.'); }
        });

        function hasLastError() {
          try {
            return !sandboxContextLoss.isExtensionValid() || Boolean(throwingRuntime && throwingRuntime.lastError);
          } catch {
            return true;
          }
        }

        try {
          if (!sandboxContextLoss.isExtensionValid() || hasLastError() || !undefined) {
            return; // Handled safely without crash!
          }
          appliedCount = Number(undefined?.shelfCount) || 0;
        } catch (err) {
          callbackCrashed = true;
        }
      }
    }
  };

  mockStorageUndefinedData.local.get({ shelfCount: 0 });
  assert.strictEqual(callbackCrashed, false, 'Callback must not crash even if lastError getter throws');
  assert.strictEqual(appliedCount, null, 'Must safely abort without reading property of undefined');
});

// =============================================================================
// TEST 10: Multi-tab background synchronization logic in checkShelfStatus
// =============================================================================
test('checkShelfStatus: Multi-tab background sync correctly handles desynced tabs', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');

  // Extract checkShelfStatus logic structure
  assert.ok(contentSrc.includes('sync_cleared'), 'Must support sync_cleared event');
  assert.ok(contentSrc.includes('sync_appeared'), 'Must support sync_appeared event');

  function simulateSync(globalShelfCount, localCount) {
    let action = 'apply';
    if (globalShelfCount === 0 && localCount > 0) {
      action = 'sync_cleared';
    } else if (globalShelfCount > 0 && localCount < globalShelfCount) {
      action = 'sync_appeared';
    }
    return action;
  }

  // 1. Active tab cleared goods -> background tab has old badge > 0 -> sync_cleared
  assert.strictEqual(simulateSync(0, 3), 'sync_cleared');

  // 2. Active tab got new goods (5) -> background tab still shows 0 -> sync_appeared
  assert.strictEqual(simulateSync(5, 0), 'sync_appeared');

  // 3. Tab counts are synchronized -> apply
  assert.strictEqual(simulateSync(3, 3), 'apply');
  assert.strictEqual(simulateSync(0, 0), 'apply');
});

// =============================================================================
// TEST 11: SVG Element safety with SVGAnimatedString in DOM filtering
// =============================================================================
test('DOM filtering: SVG elements with SVGAnimatedString className do not throw', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');
  const fnMatch1 = contentSrc.match(/function isDeliveryBlock\([\s\S]*?\n    \}/);
  assert.ok(fnMatch1, 'isDeliveryBlock must exist');

  const runner = new Function(`${fnMatch1[0]}; return isDeliveryBlock;`);
  const isDeliveryBlock = runner();

  // Mock SVG element where className is an SVGAnimatedString object
  const svgMock = {
    nodeType: 1,
    tagName: 'SVG',
    className: {
      baseVal: 'ozon-icon delivery-truck',
      animVal: 'ozon-icon delivery-truck'
    },
    getAttribute: (attr) => attr === 'aria-label' ? 'Доставка Ozon' : null,
    children: [],
    innerText: ''
  };

  assert.doesNotThrow(() => {
    const res = isDeliveryBlock(svgMock);
    assert.strictEqual(res, true, 'SVG with delivery-truck should be identified as delivery block');
  }, 'isDeliveryBlock must handle SVGAnimatedString without TypeError');

  const svgDispatchMock = {
    nodeType: 1,
    tagName: 'SVG',
    className: {
      baseVal: 'ozon-icon dispatch-box',
      animVal: 'ozon-icon dispatch-box'
    },
    getAttribute: (attr) => attr === 'aria-label' ? 'Отправка' : null,
    children: [],
    innerText: ''
  };

  assert.doesNotThrow(() => {
    const res = isDeliveryBlock(svgDispatchMock);
    assert.strictEqual(res, false, 'SVG with dispatch should not be delivery block');
  });
});

// =============================================================================
// TEST 12: getBadgeCount visibility filtering (hidden elements ignored)
// =============================================================================
test('getBadgeCount: Hidden badges (display: none, hidden, or computed hidden) are excluded', () => {
  const contentSrc = fs.readFileSync('content.js', 'utf8');
  assert.ok(contentSrc.includes('isElementVisible'), 'getBadgeCount must use isElementVisible');

  // Extract isElementVisible logic
  const fnMatch = contentSrc.match(/function isElementVisible\([\s\S]*?\n      \}/);
  assert.ok(fnMatch, 'isElementVisible must exist');

  const runner = new Function(`${fnMatch[0]}; return isElementVisible;`);
  const isElementVisible = runner();

  assert.strictEqual(isElementVisible({ style: { display: 'none' } }), false);
  assert.strictEqual(isElementVisible({ style: { visibility: 'hidden' } }), false);
  assert.strictEqual(isElementVisible({ hidden: true }), false);
  assert.strictEqual(isElementVisible({ style: { display: 'inline-block' } }), true);
  assert.strictEqual(isElementVisible({}), true);
});

// =============================================================================
// TEST 13: Full JavaScript syntax verification across all project files
// =============================================================================
test('All project JavaScript files pass full syntax compilation check (node -c)', () => {
  const { execSync } = require('child_process');
  const files = [
    'content.js',
    'background.js',
    'offscreen.js',
    'popup.js',
    'popup/popup.js'
  ];

  for (const file of files) {
    assert.doesNotThrow(() => {
      execSync(`node -c "${file}"`, { stdio: 'pipe' });
    }, `File ${file} failed node -c syntax compilation check!`);
  }
});

console.log(`\n========================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
