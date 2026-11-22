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

console.log(`\n========================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
