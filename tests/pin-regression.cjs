const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname,'..');
const baseline = process.argv.includes('--baseline');
const server = http.createServer((req,res)=>{
 let path = req.url.split('?')[0]; if(path==='/') path='/index.html';
 if(path==='/index.html' && baseline){res.setHeader('content-type','text/html');res.end(require('node:child_process').execFileSync('git',['show','0481ae4:index.html'],{cwd:root}));return;}
 try{res.setHeader('content-type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'image/png');res.end(fs.readFileSync(root+path));}catch(e){res.statusCode=404;res.end();}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 // Do not contact Firebase, sign in, or use real user state. Drive its app callback with fixtures.
 await page.route('**/sync.js',r=>r.fulfill({contentType:'application/javascript',body:'export function initSync(){return {signedIn:false,pushState(){}}}'}));
 const url=`http://127.0.0.1:${server.address().port}/`;
 const remote = async (account='test-owner',name='Fixture')=>page.evaluate(({account,name})=>{
 window.KPsync={signedIn:true,accountId:account,hasLocalBackup:()=>false};window.KPconflictResolved=true;
 window.KPonRemote({complete:true,profiles:[{id:77,name,emoji:'lion',color:'#123456'}],gallery:'builtin',lang:'he'});
 },{account,name});
 const pin=async code=>{for(const n of code)await page.locator('#pad button').filter({hasText:new RegExp('^'+n+'$')}).click();};
 await page.goto(url);await remote();
 await page.locator('#manageBtn').click();await page.locator('#grid .p').first().click();
 await page.locator('#lockSwitch').click();
 const row=await page.locator('#pad button').evaluateAll(bs=>bs.slice(0,3).map(b=>({n:b.textContent,x:b.getBoundingClientRect().x})).sort((a,b)=>a.x-b.x).map(x=>x.n));
 console.log('Hebrew keypad left-to-right:',row.join(''));
 if(!baseline) assert.deepEqual(row,['1','2','3']);
 await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'kids-pin-keypad.png')});
 await pin('1258');
 // A snapshot can arrive before Done. The editor must not save to an obsolete object.
 await remote();await page.locator('#editDone').click();await remote();
 let locks=await page.locator('#grid .lockic').count();console.log('Lock after Done + snapshot:',locks);
 if(baseline){assert.equal(locks,0);console.log('Original disappearing-lock bug reproduced');await browser.close();server.close();return;}
 assert.equal(locks,1);
 // Later settings snapshots, renamed remote profile, and reload all retain the account-local lock.
 await remote('test-owner','Renamed');assert.equal(await page.locator('#grid .lockic').count(),1);
 await page.reload();await remote('test-owner','Renamed');assert.equal(await page.locator('#grid .lockic').count(),1);
 // Wrong code blocks entry, correct code succeeds.
 await page.locator('#grid .p').first().click();await pin('9999');assert.equal(await page.locator('#pin').isVisible(),true);assert.match(await page.locator('#pinSub').innerText(),/שגוי/);
 await pin('1258');assert.equal(await page.locator('#pin').isVisible(),false);assert.equal(await page.locator('#scrWelcome').isVisible(),true);
 await page.locator('#backBtn').click();await page.locator('#manageBtn').click();await page.locator('#grid .p').first().click();
 await page.locator('#lockSwitch').click();await pin('9999');assert.equal(await page.locator('#pin').isVisible(),true);
 await pin('1258');await page.locator('#editDone').click();await remote();assert.equal(await page.locator('#grid .lockic').count(),0);
 await page.reload();await remote();assert.equal(await page.locator('#grid .lockic').count(),0);
 // Set again, then verify account isolation and no PIN in signed-out base data.
 await page.locator('#manageBtn').click();await page.locator('#grid .p').first().click();await page.locator('#lockSwitch').click();await pin('1258');await page.locator('#editDone').click();
 await remote('another-owner');assert.equal(await page.locator('#grid .lockic').count(),0);
 await remote();assert.equal(await page.locator('#grid .lockic').count(),1);
 assert.equal(await page.evaluate(()=>localStorage.getItem('kidsProfiles.v2')),null);
 await page.evaluate(()=>{window.KPsync={signedIn:false};window.KPonRemote(null)});assert.equal(await page.locator('#grid .lockic').count(),0);
 // Signed-out local storage, cancellation, and English keypad.
 await page.evaluate(()=>{ps=[{id:88,name:'Local fixture',emoji:'lion',color:'#123456'}];edit=true;render();show('scrPick')});
 await page.locator('#grid .p').first().click();await page.locator('#lockSwitch').click();await pin('1258');await page.locator('#editDone').click();
 await page.reload();assert.equal(await page.locator('#grid .lockic').count(),1);
 await page.locator('#manageBtn').click();await page.locator('#grid .p').first().click();await page.locator('#lockSwitch').click();await page.locator('#pinCancel').click();await page.locator('#editDone').click();await page.waitForFunction(()=>document.getElementById('scrEdit').hidden);assert.equal(await page.locator('#grid .lockic').count(),1);
 await page.evaluate(()=>{lang='en';edit=true;applyLang()});await page.locator('#grid .p').first().click();await page.locator('#lockSwitch').click();
 const english=await page.locator('#pad button').evaluateAll(bs=>bs.slice(0,3).map(b=>({n:b.textContent,x:b.getBoundingClientRect().x})).sort((a,b)=>a.x-b.x).map(x=>x.n));assert.deepEqual(english,['1','2','3']);
 console.log('PASS: sync during edit, snapshots, rename, reload, wrong/right PIN, removal, account isolation, sign-out, local persistence, cancel, Hebrew/English keypad');
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
