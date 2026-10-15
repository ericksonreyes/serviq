// Capture: customer portal — signup-to-tracking, desktop.
// States: login → provider home → catalog → book → request tracking →
// notifications.
import { capture, settled, login, BASE } from '../lib/capture.mjs'

await capture('customer', async ({ desktop, shot }) => {
  const p = await desktop()

  await p.goto(`${BASE.customer}/provider/acme/login`)
  await shot(p, '01-login')

  await login(p, BASE.customer, 'jane.customer')
  await settled(p)
  await shot(p, '02-home')

  // Catalog/booking entry — first CTA that leads to services.
  const catalog = p.getByRole('link', { name: /catalog|services|book/i }).first()
  if (await catalog.count()) {
    await catalog.click()
    await settled(p)
    await shot(p, '03-catalog')
  }

  // Booking form, if reachable from catalog/home nav.
  const book = p.getByRole('link', { name: /book/i }).first()
  if (await book.count()) {
    await book.click()
    await settled(p)
    await shot(p, '04-book')
  }

  // The request list lives on Home — click the first request card into
  // its tracking detail, if the account has any bookings.
  const home = p.getByRole('link', { name: /home/i }).first()
  if (await home.count()) await home.click()
  await settled(p)
  const req = p.locator('a[href^="/requests/"]').first()
  try {
    await req.waitFor({ timeout: 8000 })
    await req.click()
    await settled(p)
    await shot(p, '05-request-detail')
  } catch { /* no bookings yet — tracking shot skipped */ }

  const notifs = p.getByRole('link', { name: /notification/i }).first()
  if (await notifs.count()) {
    await notifs.click()
    await settled(p)
    await shot(p, '06-notifications')
  }
})
