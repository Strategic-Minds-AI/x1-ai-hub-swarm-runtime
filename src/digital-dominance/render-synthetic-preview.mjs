// Canonical deterministic renderer extracted without visual changes from the factory.
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export function renderSyntheticPreview(inputText) {
const s=JSON.parse(inputText);
const keys = Object.keys(s).sort().join('|');
const expectedKeys = ['business_name','contact_mode','headline','indexable','industry','location','production_release','schema_version','services','site_id','subheadline','synthetic','theme'].sort().join('|');
assert.equal(keys, expectedKeys, 'Unexpected site specification field');
assert.equal(s.schema_version, 'apex-synthetic-site-v1');
assert.equal(s.site_id, 'apex-epoxy-fixture-001');
assert.equal(s.synthetic, true);
assert.equal(s.production_release, false);
assert.equal(s.indexable, false);
assert.equal(s.contact_mode, 'synthetic_fixture_only');
assert.equal(s.industry, 'epoxy_flooring');
assert.equal(s.theme, 'dark_cinematic_blue');
assert.deepEqual(s.location, { city: 'Synthetic City', state: 'ZZ' });
assert.ok(Array.isArray(s.services) && s.services.length === 3);
for (const field of [s.business_name, s.headline, s.subheadline, ...s.services]) {
  assert.ok(typeof field === 'string' && field.trim().length >= 6 && field.length <= 240, 'Invalid display field');
}
const escape = (str) => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = x => createHash('sha256').update(x).digest('hex');
const css = [
  ':root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#060c19;color:#f1f7ff;font-synthesis:none}',
  '*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 85% 4%,#19416d 0,transparent 39%),linear-gradient(125deg,#060c19,#132849 62%,#091223);min-height:100vh}',
  'header,.container,footer{width:min(1180px,calc(100% - 40px));margin:0 auto}',
  'header{min-height:85px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #42618a69}',
  'header .mark{font-size:17px;font-weight:900;letter-spacing:.14em}header .mark b{color:#76d7ff}',
  '.tag{font-size:11px;letter-spacing:.12em;color:#a8bbd7;border:1px solid #4d709b;border-radius:40px;padding:8px 13px;text-transform:uppercase}',
  '.hero{padding:78px 0;display:grid;grid-template-columns:1.1fr .9fr;gap:65px;align-items:center}',
  '.eyebrow{color:#7be2ff;letter-spacing:.2em;text-transform:uppercase;font-size:12px;font-weight:800}',
  'h1{font-size:clamp(42px,5.6vw,78px);letter-spacing:-.06em;line-height:1.02;margin:18px 0 25px}',
  'h1 span{color:#7bdcff}p{font-size:16px;color:#b2c6df;line-height:1.72;max-width:620px}',
  '.hero-visual{position:relative;aspect-ratio:5/4;overflow:hidden;border-radius:22px;border:1px solid #4b82b8;background:linear-gradient(110deg,#050a1498,transparent),repeating-linear-gradient(158deg,#75859c2e 0 1px,transparent 1px 27px),radial-gradient(ellipse at 72% 26%,#81d8f0 0,#224d75 23%,#0c233f 48%,#070e1c 80%);box-shadow:0 25px 100px #030b1bd9}',
  '.hero-visual:before{content:"";position:absolute;inset:-25% -35%;background:repeating-conic-gradient(from 15deg,#ffffff1a 0 7deg,transparent 7deg 38deg);transform:rotate(-18deg);mix-blend-mode:screen;opacity:.35}',
  '.hero-visual:after{content:"SYNTHETIC FLOOR VISUALIZATION";position:absolute;bottom:25px;left:25px;font-size:11px;font-weight:800;letter-spacing:.16em;background:#09142dda;padding:12px 15px;border:1px solid #7fbbf277;border-radius:8px}',
  '.metrics{display:flex;gap:28px;flex-wrap:wrap;margin-top:38px}.metric{border-left:2px solid #74d9ff;padding-left:15px}.metric strong{display:block;font-size:18px}.metric small{display:block;color:#9eb1ce;font-size:12px;margin-top:6px}',
  '.section{padding:18px 0 75px}.section h2{font-size:clamp(27px,3vw,41px);letter-spacing:-.04em;margin:7px 0 15px}',
  '.services{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:30px 0 0}.service{border:1px solid #44638983;border-radius:16px;background:#1427439c;padding:27px}',
  '.service em{font-size:12px;color:#76d6ff;font-weight:800;font-style:normal}.service h3{font-size:20px;margin:17px 0}.service p{font-size:13px;margin-bottom:0}',
  '.panel{display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:start;background:#0b172da8;border:1px solid #4b7097;border-radius:24px;padding:34px;margin-bottom:55px}',
  'h3{letter-spacing:-.02em}.controls{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:24px 0}.field label{display:block;color:#aec5df;font-size:12px;font-weight:700;margin-bottom:9px}',
  'input{width:100%;padding:14px 13px;background:#162945;color:white;border:1px solid #49698a;border-radius:11px;font:inherit}',
  '.readout{color:#d8f5ff;font-size:26px;font-weight:850}.readout small{display:block;color:#9bb7d2;font-size:11px;font-weight:600;letter-spacing:.09em;margin-top:8px}',
  'button{background:linear-gradient(90deg,#7be4ff,#75aaff);color:#081429;border:none;border-radius:12px;padding:15px 20px;font-weight:850;cursor:pointer;width:100%;font-size:14px}',
  'button:hover{filter:brightness(1.1)}button:disabled{opacity:.55;cursor:wait}#api-result{border:1px solid #425b78;border-radius:11px;padding:15px;margin-top:16px;color:#aebfdb;font-size:12px;line-height:1.6}',
  '#api-result[data-ok=true]{border-color:#388974;color:#a7f1df}#api-result[data-ok=false]{border-color:#a75d5d;color:#ffcecf}',
  'footer{color:#92a6c4;border-top:1px solid #435874;padding:24px 0 42px;font-size:12px}',
  'a{color:#80dbff}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #77d4ff;outline-offset:3px}',
  '@media(max-width:820px){.hero{grid-template-columns:1fr;gap:30px;padding:50px 0}.hero-visual{aspect-ratio:1.6}.panel{grid-template-columns:1fr;gap:20px}.services{grid-template-columns:1fr}}',
  '@media(max-width:450px){header,.container,footer{width:calc(100% - 30px)}.tag{font-size:9px}.controls{grid-template-columns:1fr}.panel{padding:22px}.hero-visual{aspect-ratio:1.18}}',
  '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}'
].join('\n');
const services = s.services.map((name,i)=>
  '<article class="service"><em>0'+(i+1)+' / CONCEPT</em><h3>'+escape(name)+'</h3><p>Preview-only service layout. Final copy, specifications, regional availability and project facts require verification before publication.</p></article>'
).join('\n');
const script = [
 "(function(){",
 "const ft=document.getElementById('feet'), wd=document.getElementById('width'), amount=document.getElementById('area');",
 "const update=()=>{const a=Number(ft.value),b=Number(wd.value);amount.textContent=(Number.isFinite(a*b)&&a>0&&b>0&&a<=300&&b<=300)?Math.round(a*b).toLocaleString():'Invalid dimensions';};",
 "ft.addEventListener('input',update);wd.addEventListener('input',update);update();",
 "const form=document.getElementById('demo-form'), out=document.getElementById('api-result'), btn=document.getElementById('test-btn');",
 "form.addEventListener('submit',async function(evt){evt.preventDefault();btn.disabled=true;out.removeAttribute('data-ok');out.textContent='Calling synthetic-only API...';",
 "try{const payload={fixture_id:'apex-single-noindex-canary-v1',name:'Synthetic Test Lead',email:'synthetic-test@example.invalid',message:'Synthetic canary: form-to-API connectivity test'};",
 "const r=await fetch('/api/canary-lead',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(payload)});",
 "const data=await r.json();if(!r.ok||data.ok!==true||data.synthetic!==true||data.persisted!==false||!/^CANARY-[a-f0-9]{24}$/.test(data.receipt_id||''))throw new Error(data.code||'No verified receipt');",
 "out.dataset.ok='true';out.textContent='PASS: API receipt '+data.receipt_id+' | persisted=false | customer messages=0';}",
 "catch(e){out.dataset.ok='false';out.textContent='FAIL: '+String(e.message||e);}finally{btn.disabled=false;}});",
 "})();"
].join('\n');
const html = [
 '<!doctype html><html lang="en"><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="robots" content="noindex,nofollow,noarchive">',
 '<meta name="googlebot" content="noindex,nofollow,noarchive">',
 '<meta name="description" content="Synthetic epoxy business website preview compiled deterministically by the Digital Dominance factory. Not an operating company.">',
 '<title>'+escape(s.business_name)+'</title>',
 '<style>'+css+'</style></head><body>',
 '<header><div class="mark">APEX <b>／</b> SITE FACTORY</div><span class="tag">NOINDEX / SYNTHETIC / PROOF 001</span></header>',
 '<main class="container">',
 '<section class="hero"><div><div class="eyebrow">Website launch engine / One fixture</div>',
 '<h1>'+escape(s.headline.replace('Built from a better blueprint.',''))+'<span>Built from a better blueprint.</span></h1>',
 '<p>'+escape(s.subheadline)+'</p>',
 '<p><strong>NOT A REAL BUSINESS.</strong> This page is a deterministic, preview-only demonstration. No customer data is collected.</p>',
 '<div class="metrics"><div class="metric"><strong>01</strong><small>Reproducible site manifest</small></div><div class="metric"><strong>HTTP 200</strong><small>Independent test target</small></div><div class="metric"><strong>NOINDEX</strong><small>Header + HTML</small></div></div>',
 '</div><div class="hero-visual" role="img" aria-label="Abstract digital epoxy flooring visualization; synthetic concept, not real project photography"></div></section>',
 '<section class="section" aria-labelledby="services"><div class="eyebrow">Reusable industry components</div><h2 id="services">One template. Purpose-built service sections.</h2>',
 '<p>Industry: '+escape(s.industry.replace('_',' '))+' &nbsp;|&nbsp; Demo location: '+escape(s.location.city)+', '+escape(s.location.state)+'</p>',
 '<div class="services">'+services+'</div></section>',
 '<section class="panel" aria-labelledby="demo"><div><div class="eyebrow">Interactive website component</div><h2 id="demo">Area calculator</h2>',
 '<p>Dimensions × dimensions are calculated locally. No price, estimate, proposal, measurement, project condition, or address is inferred.</p>',
 '<div class="controls"><div class="field"><label for="feet">Length (feet)</label><input type="number" id="feet" min="1" max="300" step="1" value="20" inputmode="numeric"></div>',
 '<div class="field"><label for="width">Width (feet)</label><input type="number" id="width" min="1" max="300" step="1" value="20" inputmode="numeric"></div></div>',
 '<div class="readout"><span id="area">400</span> sq ft<small>DEMONSTRATION AREA ONLY, NOT A QUOTE</small></div></div>',
 '<div><div class="eyebrow">Backend proof</div><h2>Run the synthetic lead test</h2>',
 '<p>The test uses a fixed fake identity and a staging-only API. No SMS, email, CRM write, or customer outreach occurs.</p>',
 '<form id="demo-form"><button id="test-btn" type="submit">Run backend connection test</button></form>',
 '<div id="api-result" aria-live="polite" role="status">Server receipt has not been requested.</div></div></section>',
 '</main><footer>Site ID '+escape(s.site_id)+' · Deterministic build · No real contractor, testimonials, prices, or locations. <a href="/canary/">View original canary</a></footer>',
 '<script>'+script+'</script></body></html>'
].join('\n');
assert.ok(html.startsWith('<!doctype html>'));
assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive">/);
assert.match(html, /NOT A REAL BUSINESS/);
assert.match(html, /id="demo-form"/);
assert.ok(!/tel:\+|mailto:|http:\/\/|href="https:\/\//.test(html), 'No outbound customer actions or external links');
return {html,fixture_sha256:hash(inputText),html_sha256:hash(html)};
}
