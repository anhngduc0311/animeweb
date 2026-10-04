const { chromium } = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');
 await page.waitForFunction(()=>document.querySelectorAll('.spotlight-dot').length===7);
 const slides=[];
 for(let i=0;i<7;i++){
 await page.locator('.spotlight-dot').nth(i).click();
 slides.push({title:await page.locator('#spotlight-title').textContent(),score:await page.locator('#spotlight-score').textContent()});
 }
 console.log('Slides',JSON.stringify(slides));
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(300);
 console.log('Mobile',await page.locator('#spotlight-nav').evaluate(e=>({count:e.children.length,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:innerWidth})));
 console.log('JS errors',errors);
 }finally{await browser.close()}
})();
