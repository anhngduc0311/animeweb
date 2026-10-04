const { chromium } = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:"msedge"});
 const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://localhost:5173', {waitUntil:'networkidle',timeout:60000});
 await page.screenshot({path:'artifacts/anidoki-desktop.png'});
 console.log('Desktop', await page.evaluate(()=>({title:document.title,logo:document.querySelector('.brand-logo').naturalWidth,cards:document.querySelectorAll('.anime-card').length,overflow:document.documentElement.scrollWidth>innerWidth})));
 await page.locator('#open-login-btn').click();
 console.log('Login',await page.locator('.login-card h2').textContent());
 await page.locator('#close-login-btn').click();
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(600); await page.screenshot({path:'artifacts/anidoki-mobile.png'});
 await page.locator('#mobile-toggle-btn').click();
 console.log('Mobile menu',await page.locator('#mobile-toggle-btn').getAttribute('aria-expanded'));
 await page.locator('#mobile-toggle-btn').click();
 await page.locator('#open-search-btn').click();
 console.log('Search',await page.locator('#search-modal').evaluate(e=>e.classList.contains('active')));
 for (const width of [320,360,390,768,1024,1440]) {
 await page.setViewportSize({width,height:900});
 console.log('Layout',width, await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,headerRight:document.querySelector('.header-actions').getBoundingClientRect().right})));
 }
 console.log('JS errors',errors);
 await browser.close();
})();


