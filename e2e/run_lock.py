"""Drive the buyer's Lock on a seller's payment link with a simulated wallet over the real relay.
Usage: python e2e/run_lock.py [mock|real] [base_url]"""
import subprocess, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

mode = sys.argv[1] if len(sys.argv) > 1 else 'mock'
base = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:5174/'
url = base + '?net=chipnet'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg.on('console', lambda m: print('[page]', m.type, m.text[:220]) if m.type in ('error', 'warning') else None)
    # Payment links are built from the source on the local dev server, then opened on `base`.
    pg.goto('http://localhost:5174/?net=chipnet', wait_until='networkidle'); pg.wait_for_timeout(1000)
    code = pg.evaluate("""async () => {
      const w = await import('/src/lib/waybill.ts');
      return w.encodeRequest({ net: 'chipnet', sellerPkh: '22'.repeat(20), sats: 50000, item: 'Test shoes', price: '₦15,000', windowBlocks: 12, rid: w.newRequestId() });
    }""")
    pg.goto(url, wait_until='networkidle'); pg.wait_for_timeout(1500)
    if mode == 'mock':
        print('[e2e] funded mock address', pg.evaluate("import('/e2e/devmock.ts').then(m => m.setup())"))
    pg.evaluate(f"location.hash = '#/r/{code}'"); pg.wait_for_timeout(800)
    btn = pg.locator('.ticket-stub .btn-primary')
    print('[e2e] button before connect:', btn.inner_text())
    btn.click(); pg.wait_for_timeout(3000)
    href = pg.locator('.connect-same a').get_attribute('href')
    uri = urllib.parse.unquote(href.split('uri=')[1])
    wallet = subprocess.Popen(['node', 'e2e/sim-wallet.mjs', uri, 'chipnet'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    t0 = time.time()
    while time.time() - t0 < 40 and pg.locator('.connect-panel').count():
        pg.wait_for_timeout(500)
    print('[e2e] dialog closed after %.1fs' % (time.time() - t0), '| button:', btn.inner_text())
    btn.click()
    labels = []
    for _ in range(60):
        pg.wait_for_timeout(500)
        txt = btn.inner_text() if btn.count() else '(button gone)'
        if not labels or labels[-1] != txt: labels.append(txt)
        err = pg.locator('.form-error')
        if err.count(): print('[e2e] ERROR shown:', err.inner_text()); break
        if '#/o/' in pg.url: break
    print('[e2e] button labels after Lock:', labels)
    print('[e2e] url now:', pg.url.split('#')[1][:12] if '#' in pg.url else pg.url)
    wallet.terminate()
    out = wallet.stdout.read()
    print(out)
    b.close()
