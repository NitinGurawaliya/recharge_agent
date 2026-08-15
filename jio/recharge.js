/**
 * Strategy note (webcmd-adapter-author)
 *
 * Strategy: PUBLIC
 * Contract: visible-ui for JioOnePay QR; plans catalog is public JSON
 * Evidence (worked end-to-end, verified for 19 and 29; others extrapolated from same
 * Data Packs category/checkout pattern — verify individually before relying on them live):
 * - Entry https://www.jio.com/selfcare/recharge/mobility/ → fill number → Continue
 * - Plans API GET .../recharge/plans/serviceId/{number} includes Data Packs plans
 * - Data Packs → Buy ₹<amount> plan → redirect form → pay.jio.com → Pay via QR
 * - canvas#react-qrcode-logo value = upi://pay?... ; STOP (never pay)
 * Why narrow:
 * - Only Data Packs category plans are supported. Other categories (Popular Plans,
 *   True 5G Unlimited, etc.) were observed hitting Shopping Cart / Make Payment —
 *   out of scope. Do NOT add a plan to PLANS below unless it is within Data Packs
 *   and ideally spot-checked to reach pay.jio.com/JpgWebApp/qr-payment/ directly.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ArgumentError,
  CommandExecutionError,
  EmptyResultError,
  TimeoutError,
} from '@agentrhq/webcmd/errors';
import { cli, Strategy } from '@agentrhq/webcmd/registry';

const DOMAIN = 'jio.com';
const ENTRY_URL = 'https://www.jio.com/selfcare/recharge/mobility/';
const PLANS_API = 'https://www.jio.com/api/jio-recharge-service/recharge/plans/serviceId';

/**
 * Curated Data Packs plans. '19' and '29' are individually click-verified end-to-end.
 * The rest are same-category extrapolations (same checkout mechanism) — spot-check
 * each before a live demo; remove any that don't behave the same way.
 */
const PLANS = {
  '19': {
    amount: 19,
    planName: 'MRP 19',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '1 Day',
    planData: '1GB Data',
    buyAriaLabel: 'Buy ₹19 plan',
  },
  '29': {
    amount: 29,
    planName: 'MRP 29',
    planId: '1019864',
    categoryLabel: 'Data Packs',
    planValidity: '2 Days',
    planData: '2GB High Speed Data',
    buyAriaLabel: 'Buy ₹29 plan',
  },
  '39': {
    amount: 39,
    planName: 'DATA ONLY PACK 39',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '3 Days',
    planData: '3GB/Day',
    buyAriaLabel: 'Buy ₹39 plan',
  },
  '49': {
    amount: 49,
    planName: 'Unlimited Data Pack',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '1 Day',
    planData: 'Unlimited Data',
    buyAriaLabel: 'Buy ₹49 plan',
  },
  '69': {
    amount: 69,
    planName: 'DATA ONLY PACK 69',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '7 Days',
    planData: '6GB',
    buyAriaLabel: 'Buy ₹69 plan',
  },
  '139': {
    amount: 139,
    planName: 'DATA ONLY PACK 139',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '7 Days',
    planData: '12GB',
    buyAriaLabel: 'Buy ₹139 plan',
  },
  '219': {
    amount: 219,
    planName: 'DATA ONLY PACK 219',
    planId: null,
    categoryLabel: 'Data Packs',
    planValidity: '30 Days',
    planData: '30GB',
    buyAriaLabel: 'Buy ₹219 plan',
  },
};

const DEFAULT_PLAN = '29';

function normalizeNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new ArgumentError('number must be a 10-digit Indian mobile starting with 6-9');
  }
  return digits;
}

function resolvePlan(raw) {
  const key = String(raw ?? DEFAULT_PLAN).trim();
  const plan = PLANS[key];
  if (!plan) {
    const supported = Object.keys(PLANS).join(', ');
    throw new ArgumentError(`plan must be one of: ${supported} (got "${key}")`);
  }
  return plan;
}

function artifactsDir() {
  const dir = path.join(os.homedir(), '.webcmd', 'sites', 'jio', 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function href(page) {
  try {
    return String((await page.evaluate(`(() => location.href)()`)) || '');
  } catch {
    return '';
  }
}

async function sleep(page, seconds) {
  await page.sleep(seconds);
}

async function waitFor(page, label, timeoutSec, fn) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {
      // navigation / context churn
    }
    await sleep(page, 0.4);
  }
  throw new TimeoutError(label, timeoutSec);
}

function findPlanInCatalog(node, planDef, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) findPlanInCatalog(item, planDef, acc);
    return acc;
  }
  const id = String(node.id || node.voucherId || '');
  const planName = String(node.planName || node.name || '');
  const amount = Number(node.amount ?? node.price ?? node.filterKeys?.price);

  const idMatches = planDef.planId && id === planDef.planId;
  const nameMatches = planName === planDef.planName;
  const amountMatches = amount === planDef.amount;

  if (idMatches || nameMatches || amountMatches) {
    acc.push({
      id,
      planName: planName || planDef.planName,
      amount: Number.isFinite(amount) ? amount : planDef.amount,
      categoryLabel: String(node.categoryLabel || planDef.categoryLabel),
    });
  }
  for (const value of Object.values(node)) findPlanInCatalog(value, planDef, acc);
  return acc;
}

async function enterNumber(page, mobile) {
  await page.goto(ENTRY_URL, { waitUntil: 'load' });
  await waitFor(page, 'number input', 25, async () =>
    Boolean(await page.evaluate(`(() => Boolean(document.querySelector('#submitNumber')))()`)),
  );

  await page.fillText('#submitNumber', mobile);
  await page.evaluateWithArgs(
    `(() => {
      const input = document.querySelector('#submitNumber');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    { value: mobile },
  );
  await sleep(page, 0.3);

  try {
    await page.click('button[aria-label="Continue"]');
  } catch {
    await page.evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button[aria-label="Continue"]')]
          .find((el) => el.getBoundingClientRect().width > 0);
        if (!btn) throw new Error('no Continue');
        btn.click();
      })()
    `);
  }

  await waitFor(page, 'plans page', 40, async () => {
    const url = await href(page);
    if (!url.includes('/recharge/mobility/plans/')) return false;
    return Boolean(
      await page.evaluate(`
        (() => Boolean(
          document.querySelector('button[aria-label="Popular Plans"]') ||
          document.querySelector('button[aria-label="Data Packs"]') ||
          document.querySelector('#cardContainer')
        ))()
      `),
    );
  });
}

async function confirmPlanViaApi(page, mobile, planDef) {
  let catalog;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await sleep(page, 0.6);
      catalog = await page.evaluateWithArgs(
        `(async () => {
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })()`,
        { url: `${PLANS_API}/${mobile}` },
      );
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!catalog) {
    throw new CommandExecutionError(
      `Failed to load plans catalog: ${lastError?.message || lastError}`,
    );
  }

  const matches = findPlanInCatalog(catalog, planDef);
  if (!matches.length) {
    throw new EmptyResultError('jio recharge', `${planDef.planName} plan not available for this number`);
  }
  const plan =
    matches.find((row) => planDef.planId && row.id === planDef.planId) ||
    matches.find((row) => row.planName === planDef.planName) ||
    matches[0];
  return plan;
}

async function selectPlan(page, planDef) {
  try {
    await page.click(`button[aria-label="${planDef.categoryLabel}"]`);
  } catch {
    await page.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Data Packs"]');
        if (btn) btn.click();
      })()
    `);
  }
  await sleep(page, 1.2);

  const buySelector = `button[aria-label="${planDef.buyAriaLabel}"]`;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      await page.click(buySelector);
      return;
    } catch {
      await page.scroll('down', 1000);
      await sleep(page, 0.45);
    }
  }
  throw new CommandExecutionError(
    `Could not click ${planDef.buyAriaLabel}`,
    `Confirm ${planDef.planName} is listed under ${planDef.categoryLabel} for this number.`,
  );
}

async function waitForPayJio(page) {
  await waitFor(page, 'pay.jio.com', 60, async () => {
    const url = await href(page);
    if (url.includes('pay.jio.com')) return true;
    try {
      await page.evaluate(`
        (() => {
          const form = document.querySelector('form#payment');
          if (form) form.submit();
        })()
      `);
    } catch {
      // ignore
    }
    return false;
  });
}

async function openPayViaQr(page) {
  await waitFor(page, 'Pay via QR label', 45, async () => {
    const text = await page.evaluate(`(() => document.body?.innerText || '')()`);
    return /Pay via QR/i.test(String(text));
  });

  await page.evaluate(`
    (() => {
      const labels = [...document.querySelectorAll('div')].filter((el) =>
        (el.textContent || '').trim() === 'Pay via QR' && el.children.length === 0
      );
      if (!labels.length) throw new Error('Pay via QR not found');
      let row = labels[0];
      for (let i = 0; i < 5 && row.parentElement; i += 1) {
        row = row.parentElement;
        if (row.getBoundingClientRect().height >= 40) break;
      }
      row.setAttribute('data-webcmd-pay-qr', '1');
    })()
  `);

  try {
    await page.click('[data-webcmd-pay-qr="1"]');
  } catch {
    await page.evaluate(`(() => document.querySelector('[data-webcmd-pay-qr="1"]')?.click())()`);
  }

  await waitFor(page, 'qr-payment page', 35, async () =>
    (await href(page)).includes('qr-payment'),
  );
}

async function extractQr(page) {
  await waitFor(page, 'QR canvas', 40, async () =>
    Boolean(await page.evaluate(`(() => Boolean(document.getElementById('react-qrcode-logo')))()`)),
  );

  const payload = await page.evaluate(`
    (() => {
      const canvas = document.getElementById('react-qrcode-logo');
      if (!canvas) return { ok: false };
      const dataUrl = canvas.toDataURL('image/png');
      let upiUri = null;
      for (const key of Object.keys(canvas)) {
        if (!key.includes('reactFiber') && !key.includes('reactInternalInstance')) continue;
        let fiber = canvas[key];
        for (let i = 0; i < 20 && fiber; i += 1) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          if (props && typeof props.value === 'string' && props.value.startsWith('upi://')) {
            upiUri = props.value;
            break;
          }
          fiber = fiber.return;
        }
        if (upiUri) break;
      }
      return { ok: true, upiUri, dataUrl };
    })()
  `);

  if (!payload?.ok || !payload.dataUrl) {
    throw new CommandExecutionError('QR canvas export failed');
  }
  if (!payload.upiUri || !String(payload.upiUri).startsWith('upi://')) {
    throw new CommandExecutionError('UPI URI missing on QR canvas');
  }
  return payload;
}

cli({
  site: 'jio',
  name: 'recharge',
  access: 'write',
  description:
    'Generate a Jio prepaid UPI QR for a supported Data Packs plan on a mobile number; stops on the QR screen',
  domain: DOMAIN,
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  siteSession: 'ephemeral',
  example: 'webcmd jio recharge 9466444175 29',
  args: [
    {
      name: 'number',
      type: 'string',
      required: true,
      positional: true,
      help: '10-digit Jio prepaid mobile number',
    },
    {
      name: 'plan',
      type: 'string',
      required: false,
      positional: true,
      help: `Plan amount to recharge. Supported: ${Object.keys(PLANS).join(', ')} (default: ${DEFAULT_PLAN})`,
    },
  ],
  columns: [
    'status',
    'number',
    'amount',
    'plan_name',
    'plan_validity',
    'plan_data',
    'upi_uri',
    'qr_image_path',
  ],
  func: async (page, args) => {
    const mobile = normalizeNumber(args.number);
    const planDef = resolvePlan(args.plan);

    await enterNumber(page, mobile);
    await confirmPlanViaApi(page, mobile, planDef);
    await selectPlan(page, planDef);
    await waitForPayJio(page);
    await openPayViaQr(page);

    const qr = await extractQr(page);

    const qrImagePath = path.join(
      artifactsDir(),
      `qr-${mobile}-${planDef.amount}-${Date.now()}.png`,
    );
    const dataUrl = String(qr.dataUrl);
    const markerAt = dataUrl.indexOf('base64,');
    if (markerAt < 0) throw new CommandExecutionError('QR data URL was not base64 PNG');
    fs.writeFileSync(
      qrImagePath,
      Buffer.from(dataUrl.slice(markerAt + 'base64,'.length), 'base64'),
    );

    return [
      {
        status: 'qr_generated',
        number: mobile,
        amount: planDef.amount,
        plan_name: planDef.planName,
        plan_validity: planDef.planValidity,
        plan_data: planDef.planData,
        upi_uri: qr.upiUri,
        qr_image_path: qrImagePath,
      },
    ];
  },
});