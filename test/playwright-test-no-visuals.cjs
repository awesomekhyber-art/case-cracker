// TEST-ONLY — verifies a case with visuals:null / missing entirely never
// crashes the Forge panel or the rest of the case flow.
const { chromium } = require('playwright');

const MOCK_CASE_NO_VISUALS = {
  topic: "Test Case: No Visuals",
  choices: [{ letter: "A", text: "Choice A" }, { letter: "B", text: "Choice B" }],
  correctLetter: "A",
  tldr: "A minimal case with **no visuals data** at all.",
  clues: [{ clue: "test clue", flag: "test flag" }],
  pathophys: ["Step one."],
  visualStyle: "schematic",
  diagramTitle: "",
  diagramShapes: [],
  compareTable: null,
  distractors: [{ letter: "B", reason: "Just wrong." }],
  oneStepFurther: { question: "Bonus?", answer: "Yes." },
  mnemonic: "Test mnemonic",
  analogy: "Test analogy.",
  quiz: [],
  // visuals deliberately omitted entirely — simulates the model skipping it
};

(async () => {
  const results = [];
  function check(name, cond){ results.push({name, pass: !!cond}); console.log((cond?'✅ PASS':'❌ FAIL')+' — '+name); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => { console.log('  [UNCAUGHT PAGE ERROR]', err.message); results.push({name:'no uncaught errors', pass:false}); });

  let authed = false;
  await page.route('**/api/auth', async (route) => {
    const req = route.request();
    if(req.method() === 'GET'){ await route.fulfill({status: authed?200:401, contentType:'application/json', body: JSON.stringify({ok:authed})}); }
    else { authed = true; await route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({ok:true})}); }
  });
  await page.route('**/api/case', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content:[{type:'text', text: JSON.stringify(MOCK_CASE_NO_VISUALS)}], stop_reason:'end_turn' }) });
  });

  await page.goto('http://127.0.0.1:8792/index.html');
  await page.waitForTimeout(300);
  await page.fill('#pin-input', 'any-pin');
  await page.click('#pin-submit-btn');
  await page.waitForTimeout(300);

  await page.fill('#vignette-input', 'test');
  await page.click('#crack-btn');
  await page.waitForSelector('#stage-mount h3', { timeout: 5000 });
  check('Case with no visuals still renders', await page.textContent('#stage-mount h3'));

  const choiceBtn = await page.$('button.choice-btn[data-letter="A"]');
  if(choiceBtn) await choiceBtn.click();

  let reachedMnemonic = false;
  for(let i=0;i<8;i++){
    const forgePanel = await page.$('#forge-panel');
    if(forgePanel){ reachedMnemonic = true; break; }
    const nextBtn = await page.$('#next-btn:not([disabled])');
    if(nextBtn){ await nextBtn.click(); await page.waitForTimeout(200); continue; }
    break;
  }
  check('Reached Lock It In stage without crashing', reachedMnemonic);

  if(reachedMnemonic){
    const disabledCount = await page.$$eval('.forge-btn[disabled]', els => els.length);
    check('All 3 Forge buttons disabled when no visuals exist', disabledCount === 3);
  }

  // Quiz stage with an empty quiz array — should show graceful fallback, not crash
  let reachedQuiz = false;
  for(let i=0;i<3;i++){
    const nextBtn = await page.$('#next-btn:not([disabled])');
    if(nextBtn){ await nextBtn.click(); await page.waitForTimeout(200); }
    const finishBtn = await page.$('#finish-btn');
    if(finishBtn){ reachedQuiz = true; break; }
  }
  check('Empty quiz array degrades gracefully to a Finish button (no crash)', reachedQuiz);

  await browser.close();
  const failed = results.filter(r=>!r.pass);
  console.log('\n' + '='.repeat(50));
  console.log(`TOTAL: ${results.length} checks, ${results.length-failed.length} passed, ${failed.length} failed`);
  if(failed.length){ console.log('FAILED:', failed.map(f=>f.name).join('; ')); process.exit(1); }
})();
