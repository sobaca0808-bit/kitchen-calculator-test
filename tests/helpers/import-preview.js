'use strict';

// Earlier scenarios exercise replacement semantics. The import UI now requires
// a read-only preview and a separate, explicit choice before that replacement.
async function replaceJSONFromFile(page, data, {
  name = 'fictional-backup.json', accept = true, waitForCompletion = true
} = {}) {
  await page.locator('#message').evaluate(element => { element.textContent = ''; });
  await page.locator('#import-file').setInputFiles({
    name, mimeType: 'application/json',
    buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#import-panel');
    return /Импорт отменён/.test(document.querySelector('#message')?.textContent || '') ||
      (panel && !panel.hidden && panel.getAttribute('aria-busy') === 'false');
  });
  if (/Импорт отменён/.test(await page.locator('#message').innerText())) return;
  await page.locator('#import-mode').selectOption('replace');
  await page.waitForFunction(() => document.querySelector('#import-panel')?.getAttribute('aria-busy') === 'false');

  if (!accept) {
    // Keep the old cancellation assertion meaningful: dismiss the destructive
    // replacement warning, rather than merely skipping its apply button.
    const handlers = page.listeners('dialog');
    page.removeAllListeners('dialog');
    let dismissal;
    const policy = dialog => { dismissal = dialog.dismiss(); };
    page.on('dialog', policy);
    const warning = page.waitForEvent('dialog');
    warning.catch(() => {}); // A failed apply click must not leave an unhandled event timeout.
    try {
      await page.locator('#import-apply').click();
      await warning;
      await dismissal;
    } finally {
      page.removeAllListeners('dialog');
      for (const handler of handlers) page.on('dialog', handler);
    }
    if (await page.locator('#import-panel').isVisible()) await page.locator('#import-cancel').click();
    return;
  }

  await page.locator('#import-apply').click();
  // Some existing scenarios intentionally pause photo staging and inspect the
  // locked workspace. They must regain control while the async apply is pending.
  if (waitForCompletion) {
    await page.waitForFunction(() => /Данные импортированы|База заменена|Объединение выполнено|Импорт отменён/.test(document.querySelector('#message')?.textContent || ''));
  }
}

module.exports = {replaceJSONFromFile};
