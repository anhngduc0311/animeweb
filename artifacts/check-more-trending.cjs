const {chromium}=require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});let fail=true;let requests=[];const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/anime/trending?*',async route=>{const page=Number(new URL(route.request().url()).searchParams.get('page'));requests.push(page);if(page===2&&fail){fail=false;await route.fulfill({status:502,contentType:'application/json',body:'{"success":false}'});}else if(page===3){await route.fulfill({contentType:'application/json',body:'{"success":true,"data":[],"pagination":{"page":3,"hasMore":false}}'});}else await route.continue();});
 await p.goto('http://localhost:5173');await p.waitForFunction(()=>document.querySelectorAll('#trending-grid .anime-card').length===12);
 await p.locator('#load-more-trending').click();await p.waitForFunction(()=>!document.querySelector('#load-more-trending').disabled);
 console.log('Failure preserves',await p.locator('#trending-grid .anime-card').count());
 await p.locator('#load-more-trending').click();await p.waitForFunction(()=>document.querySelectorAll('#trending-grid .anime-card').length===24);
 console.log('Retry adds',await p.locator('#trending-grid .anime-card').count());
 console.log('Ratings and unique',await p.locator('#trending-grid .anime-card').evaluateAll(es=>({allAboveSeven:es.every(e=>Number(e.querySelector('.badge-score').textContent.replace('★',''))>=7),unique:new Set(es.map(e=>e.dataset.seriesKey)).size})));
 await p.setViewportSize({width:390,height:844});await p.locator('#view-all-trending').click();await p.waitForFunction(()=>document.querySelector('#load-more-trending').hidden);
 console.log('End controls hidden',!await p.locator('#load-more-trending').isVisible(),!await p.locator('#view-all-trending').isVisible());
 console.log('Request pages',requests,'JS errors',errors);
 }finally{await b.close();}})();
