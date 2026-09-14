// TEST-ONLY script — not part of the shipped app. Exercises the real
// index.html in a headless browser with mocked /api/* responses, since we
// have no live Anthropic/OpenAI credentials in this sandbox.
const { chromium } = require('playwright');

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const MOCK_CASE = {
  topic: "Test Case: Nephrotic Syndrome",
  choices: [
    { letter: "A", text: "Minimal change disease" },
    { letter: "B", text: "Membranous nephropathy" },
    { letter: "C", text: "FSGS" },
    { letter: "D", text: "IgA nephropathy" }
  ],
  correctLetter: "A",
  tldr: "This is **minimal change disease** — the most common cause of nephrotic syndrome in children.",
  clues: [{ clue: "periorbital edema in a child", flag: "classic nephrotic presentation" }],
  pathophys: ["Podocyte foot process effacement", "Massive proteinuria", "Hypoalbuminemia", "Edema"],
  visualStyle: "schematic",
  diagramTitle: "NEPHROTIC SYNDROME",
  diagramShapes: [
    { shape: "ellipse", cx: 260, cy: 160, rx: 60, ry: 45, fill: "#2DD4BF", opacity: 0.5, finding: true },
    { shape: "label", x: 260, y: 160, labelX: 380, labelY: 100, text: "Glomerulus", fill: "#EAF0F6" }
  ],
  compareTable: null,
  distractors: [
    { letter: "B", reason: "Membranous nephropathy is more common in adults." },
    { letter: "C", reason: "FSGS is more common in Black adults with hypertension." },
    { letter: "D", reason: "IgA nephropathy presents with hematuria, not this picture." }
  ],
  oneStepFurther: { question: "What is the treatment?", answer: "Corticosteroids." },
  mnemonic: "**MCD** = Most Common in kiDs",
  analogy: "The kidney's filter becomes a sieve with holes too big, letting protein leak through like flour through a colander.",
  quiz: [
    { prompt: "What is the classic biopsy finding?", options: [{id:"a",text:"Normal on light microscopy"},{id:"b",text:"Crescents"},{id:"c",text:"Wire loops"},{id:"d",text:"Mesangial deposits"}], correctOptionId: "a", explanation: "Minimal change disease looks normal on light microscopy; foot process effacement is only visible on EM." }
  ],
  visuals: {
    medical: {
      visualType: "medical", prompt: "A clean cross-section illustration of a glomerulus with effaced podocyte foot processes, labeled diagram style.",
      learningTargets: ["podocyte effacement", "proteinuria"],
      visualAnchors: [{concept:"podocyte effacement", object:"flattened foot processes on the capillary wall"}],
      mustInclude: ["glomerular capillary loop"], mustAvoid: ["crescents", "wire loops"],
      recallPrompt: "What diagnosis does this illustration represent?",
      mechanismPrompt: "Why does foot process effacement cause proteinuria?"
    },
    memoryPalace: {
      visualType: "memoryPalace", prompt: "A giant kidney-shaped nightclub with a security fence full of holes, protein characters escaping, water balloons labeled EDEMA piling up outside, and a liver DJ booth launching cholesterol-topped pizza slices into the crowd.",
      learningTargets: ["proteinuria","edema","hyperlipidemia"],
      visualAnchors: [
        {concept:"proteinuria", object:"protein characters escaping through the fence holes"},
        {concept:"edema", object:"water balloons piling up outside"},
        {concept:"hyperlipidemia", object:"the liver launching cholesterol pizzas"}
      ],
      mustInclude: ["kidney nightclub","fence with holes","pizza"], mustAvoid: ["unrelated organs"],
      recallPrompt: "What diagnosis does this scene represent?",
      mechanismPrompt: "Why is the liver throwing cholesterol pizzas?"
    },
    unhinged: {
      visualType: "unhinged", prompt: "A kidney wearing a torn business suit sobbing while protein money flies out of its pockets into a wind tunnel, comically exaggerated.",
      learningTargets: ["massive proteinuria"],
      visualAnchors: [{concept:"proteinuria", object:"money (protein) flying out of pockets"}],
      mustInclude: ["kidney character"], mustAvoid: [],
      recallPrompt: "What is this kidney losing so dramatically?",
      mechanismPrompt: "What barrier normally prevents this loss?"
    }
  }
};

function anthropicShapedResponse(caseObj){
  return { content: [{ type: "text", text: JSON.stringify(caseObj) }], stop_reason: "end_turn" };
}

(async () => {
  const results = [];
  function check(name, cond){
    results.push({ name, pass: !!cond });
    console.log((cond ? '✅ PASS' : '❌ FAIL') + ' — ' + name);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => { if(msg.type() === 'error') console.log('  [browser console error]', msg.text()); });
  page.on('pageerror', err => console.log('  [uncaught page error]', err.message));

  // ---- Mock state ----
  let authed = false;
  let imageCallCount = 0;
  let imageShouldFail = false;

  await page.route('**/api/auth', async (route) => {
    const req = route.request();
    if(req.method() === 'GET'){
      await route.fulfill({ status: authed ? 200 : 401, contentType: 'application/json', body: JSON.stringify({ ok: authed }) });
    } else {
      const body = req.postDataJSON();
      if(body.pin === 'correct-pin'){
        authed = true;
        await route.fulfill({ status: 200, contentType: 'application/json', headers: {'Set-Cookie':'cc_session=mocktoken; Path=/'}, body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Incorrect PIN' } }) });
      }
    }
  });

  await page.route('**/api/case', async (route) => {
    if(!authed){ await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unauthorized' } }) }); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(anthropicShapedResponse(MOCK_CASE)) });
  });

  await page.route('**/api/image', async (route) => {
    if(!authed){ await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success:false, error: { message: 'Unauthorized' } }) }); return; }
    imageCallCount++;
    if(imageShouldFail){
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success:false, error: { message: 'Mock upstream failure' } }) });
      return;
    }
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, image: { mimeType: 'image/png', data: PNG_1x1, model: body.model, visualType: body.visualType }
    })});
  });

  await page.goto('http://127.0.0.1:8792/index.html');

  // ---- TEST: PIN gate shown initially ----
  await page.waitForTimeout(300);
  check('PIN gate visible on first load', await page.isVisible('#pin-gate:not(.hidden)'));

  // ---- TEST: wrong PIN rejected ----
  await page.fill('#pin-input', 'wrong-pin');
  await page.click('#pin-submit-btn');
  await page.waitForTimeout(300);
  const errText = await page.textContent('#pin-error');
  check('Wrong PIN shows error message', errText && errText.includes('Incorrect'));
  check('Gate still visible after wrong PIN', await page.isVisible('#pin-gate:not(.hidden)'));

  // ---- TEST: correct PIN unlocks ----
  await page.fill('#pin-input', 'correct-pin');
  await page.click('#pin-submit-btn');
  await page.waitForTimeout(300);
  check('Gate hides after correct PIN', await page.isHidden('#pin-gate') || (await page.getAttribute('#pin-gate','class') || '').includes('hidden'));

  // ---- TEST: crack a case (mocked) ----
  await page.fill('#vignette-input', 'A test vignette for functional testing purposes.');
  await page.click('#crack-btn');
  await page.waitForSelector('#stage-mount h3', { timeout: 5000 });
  const topicText = await page.textContent('#stage-mount h3');
  check('Case renders with mocked topic', topicText && topicText.includes('Nephrotic Syndrome'));

  // ---- Navigate: pick correct answer, then walk through stages to Mnemonic ----
  const choiceBtn = await page.$('button.choice-btn[data-letter="A"]');
  check('Guess stage choice buttons rendered', !!choiceBtn);
  if(choiceBtn) await choiceBtn.click();
  await page.waitForTimeout(200);

  // Click Next repeatedly until we reach the mnemonic (Lock In) stage or run out of clicks
  let reachedForge = false;
  for(let i = 0; i < 8; i++){
    const forgePanel = await page.$('#forge-panel');
    if(forgePanel){ reachedForge = true; break; }
    const nextBtn = await page.$('#next-btn:not([disabled])');
    if(nextBtn) await nextBtn.click();
    await page.waitForTimeout(250);
  }
  check('Reached Visual Memory Forge panel by navigating stages', reachedForge);

  // ---- TEST: generate a Forge image (mocked success) ----
  if(reachedForge){
    await page.click('.forge-btn[data-type="memoryPalace"]');
    await page.waitForSelector('.forge-image-wrap img', { timeout: 5000 }).catch(()=>{});
    const imgVisible = await page.isVisible('.forge-image-wrap img');
    check('Forge image renders after mocked generation', imgVisible);
    const imgSrc = imgVisible ? await page.getAttribute('.forge-image-wrap img', 'src') : null;
    check('Forge image uses a blob: object URL (real Blob storage, not raw base64 in DOM)', !!imgSrc && imgSrc.startsWith('blob:'));

    // ---- TEST: Save button works ----
    const saveBtn = await page.$('#forge-save-btn');
    if(saveBtn) await saveBtn.click();
    await page.waitForTimeout(300);
    const saveBtnText = await page.textContent('#forge-save-btn');
    check('Save button flips to "Saved" state', saveBtnText && saveBtnText.includes('Saved'));

    // ---- TEST: IndexedDB actually has the image stored as a Blob ----
    const idbCheck = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('case-cracker-images-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('images', 'readonly');
          const cursorReq = tx.objectStore('images').openCursor();
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if(cursor){
              resolve({ found: true, isBlob: cursor.value instanceof Blob, size: cursor.value.size });
            } else {
              resolve({ found: false });
            }
          };
        };
        req.onerror = () => resolve({ found: false, error: true });
      });
    });
    check('Image persisted in IndexedDB as a real Blob (not a base64 string)', idbCheck.found && idbCheck.isBlob);

    // ---- TEST: Forge failure + Retry ----
    imageShouldFail = true;
    await page.click('.forge-btn[data-type="unhinged"]');
    await page.waitForSelector('.forge-error', { timeout: 5000 }).catch(()=>{});
    const errorShown = await page.isVisible('.forge-error');
    check('Forge shows error state on API failure (does not crash the app)', errorShown);
    const caseStillWorks = await page.isVisible('#forge-panel');
    check('Rest of case UI still intact after Forge failure', caseStillWorks);

    imageShouldFail = false;
    const retryBtn = await page.$('#forge-retry-btn');
    if(retryBtn) await retryBtn.click();
    await page.waitForSelector('.forge-image-wrap img', { timeout: 5000 }).catch(()=>{});
    check('Retry button successfully recovers after failure', await page.isVisible('.forge-image-wrap img'));
  }

  // ---- Finish the case: walk to Quiz and complete it ----
  let finished = false;
  for(let i = 0; i < 15; i++){
    const finishBtn = await page.$('#finish-btn');
    if(finishBtn){ await finishBtn.click(); finished = true; break; }
    const quizOption = await page.$('#quiz-options .choice-btn:not([disabled])');
    if(quizOption){ await quizOption.click(); await page.waitForTimeout(250); continue; }
    const quizNextBtn = await page.$('#quiz-next-btn:not([disabled])');
    if(quizNextBtn){ await quizNextBtn.click(); await page.waitForTimeout(250); continue; }
    const nextBtn = await page.$('#next-btn:not([disabled])');
    if(nextBtn){ await nextBtn.click(); await page.waitForTimeout(250); continue; }
    break;
  }
  await page.waitForTimeout(400);
  check('Case flow reaches completion (finish-btn clicked)', finished);

  // ---- TEST: Deck shows the completed case with a 🎨 badge ----
  const deckBtn = await page.$('#deck-open-btn');
  if(deckBtn) await deckBtn.click();
  await page.waitForTimeout(300);
  const deckBodyText = await page.textContent('#deck-body');
  check('Deck modal opens and lists the completed case', deckBodyText && deckBodyText.includes('Nephrotic Syndrome'));
  check('Deck entry shows the 🎨 saved-memory badge', deckBodyText && deckBodyText.includes('🎨'));

  // ---- TEST: Review restores the saved image ----
  const reviewBtn = await page.$('[data-review]');
  if(reviewBtn) await reviewBtn.click();
  await page.waitForTimeout(500);
  // Navigate to mnemonic stage again in review mode
  let reachedForgeReview = false;
  for(let i = 0; i < 8; i++){
    const forgePanel = await page.$('#forge-panel');
    if(forgePanel){ reachedForgeReview = true; break; }
    const nextBtn = await page.$('#next-btn:not([disabled])');
    if(nextBtn) await nextBtn.click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  const reviewImgVisible = reachedForgeReview ? await page.isVisible('.forge-image-wrap img') : false;
  check('Reviewing the deck entry restores the saved image from IndexedDB', reviewImgVisible);

  // ---- TEST: existing systems still functional (XP counter present & numeric) ----
  const xpText = await page.textContent('#xp-val');
  check('XP counter still renders (existing gamification untouched)', xpText && /^\d+$/.test(xpText.trim()));

  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log('\n' + '='.repeat(50));
  console.log(`TOTAL: ${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed`);
  if(failed.length){
    console.log('FAILED CHECKS:', failed.map(f=>f.name).join('; '));
    process.exit(1);
  }
})();
