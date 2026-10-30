import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const errors = [], virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(fs.readFileSync(new URL('./manager-overview.html',import.meta.url),'utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,
  beforeParse(window) {
    const captures = new WeakMap();
    window.HTMLElement.prototype.scrollIntoView = function() {};
    window.HTMLElement.prototype.setPointerCapture = function(id) {captures.set(this,id);};
    window.HTMLElement.prototype.hasPointerCapture = function(id) {return captures.get(this) === id;};
    window.HTMLElement.prototype.releasePointerCapture = function() {captures.delete(this);};
    Object.defineProperty(window.HTMLElement.prototype,'offsetHeight',{get() {return this.id === 'landing' ? 60 : 30;}});
    Object.defineProperty(window.HTMLElement.prototype,'offsetTop',{get() {return this.id === 'landing' ? 18 + Number(this.dataset.target)*30 : 0;}});
    window.HTMLElement.prototype.getBoundingClientRect = function() {
      if(this.id === 'summary-viewport') return {top:162,bottom:564,left:20,right:698,height:402,width:678};
      return this.id === 'rail' ? {top:176,bottom:551,left:720,right:738,height:375,width:18} : {top:100,bottom:600,left:0,right:780,height:500,width:780};
    };
  }
});
const {window} = dom, d = window.document, $ = s => d.querySelector(s);
const order = () => [...d.querySelectorAll('.comment')].map(e=>e.dataset.id);
const key = k => d.dispatchEvent(new window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
function pointer(type,y=300,x=740,element=$('#pane'),id=1) {
  const e = new window.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true});
  Object.defineProperties(e,{pointerId:{value:id},isPrimary:{value:id===1},pointerType:{value:'touch'}});
  element.dispatchEvent(e);
}
function begin(index=2,y=300) {pointer('pointerdown',y,740,d.querySelectorAll('.grip')[index]);}
function scenario(kind) {$('#sample').value=kind;$('#sample').dispatchEvent(new window.Event('change'));}
let checks=0;
function pass(name) {console.log(`PASS ${name}`);checks++;}
function aligned() {
  const shift=Number($('#summary-list').style.transform.match(/translateY\(([-.\d]+)px\)/)[1]);
  const cardCenter=162+shift+$('#landing').offsetTop+30;
  const thumbCenter=176+Number.parseFloat($('#thumb').style.top);
  assert(Math.abs(cardCenter-thumbCenter)<0.01,`landing ${cardCenter} must follow thumb ${thumbCenter}`);
  assert(cardCenter>=200 && cardCenter<=526,'landing must remain fully visible');
  return cardCenter;
}
try {
  const base=order(); assert.equal(base.length,14); assert.equal(d.querySelectorAll('.comment img').length,2);
  begin();pointer('pointerup'); assert.deepEqual(order(),base);assert($('#undo').disabled);pass('tap does not reorder or enter overview');
  begin();pointer('pointermove',304);assert(!$('#pane').classList.contains('dragging'));pointer('pointermove',308);
  assert($('#pane').classList.contains('dragging'));assert.equal($('#landing').dataset.target,'2');assert.deepEqual(order(),base);
  assert.equal(d.querySelectorAll('.summary').length,13);assert.equal(d.querySelectorAll('.neighbor').length,2);
  const initialCenter=aligned();pointer('pointermove',309);assert.equal($('#landing').dataset.target,'2');assert(aligned()>initialCenter);
  pointer('pointermove',545);assert.equal($('#landing').dataset.target,'13');assert.deepEqual(order(),base);
  aligned();
  pointer('pointerup',545);assert.equal(order().at(-1),base[2]);assert(!$('#pane').classList.contains('dragging'));
  pointer('pointerup',545);$('#undo').click();assert.deepEqual(order(),base);assert($('#undo').disabled);pass('continuous preview, anchored entry, bottom release once and undo');
  begin(5);pointer('pointermove',182);assert.equal($('#landing').dataset.target,'0');aligned();pointer('pointerup',182);assert.equal(order()[0],base[5]);$('#undo').click();pass('move to first and restore; card and thumb aligned at endpoints and within same target');
  begin();pointer('pointermove',310);pointer('pointermove',300);pointer('pointerup',300);assert.deepEqual(order(),base);assert($('#undo').disabled);pass('return to original position has no history');
  for(const interruption of ['escape','pointercancel','capture','blur','resize','outside','second-pointer','switch']) {
    scenario('mixed');const before=order();begin();pointer('pointermove',450);
    if(interruption==='escape') key('Escape');
    if(interruption==='pointercancel') pointer('pointercancel',450);
    if(interruption==='capture') pointer('lostpointercapture',450);
    if(interruption==='blur'||interruption==='resize') window.dispatchEvent(new window.Event(interruption));
    if(interruption==='outside') {pointer('pointermove',450,850);assert($('#overview').classList.contains('cancelled'));pointer('pointerup',450,850);}
    if(interruption==='second-pointer') pointer('pointerdown',450,750,$('#pane'),2);
    if(interruption==='switch') scenario('mixed');
    pointer('pointerup',450);assert.deepEqual(order(),before);assert(!$('#pane').classList.contains('dragging'));assert($('#undo').disabled);
  } pass('Escape, pointer cancellation, lost capture, blur, resize, outside, second touch and scenario change');
  begin();pointer('pointermove',450,860);pointer('pointermove',545,740);assert(!$('#overview').classList.contains('cancelled'));pointer('pointerup',545);assert.equal(order().at(-1),'c2');$('#undo').click();pass('return from cancellation region resumes drag');
  scenario('long');assert.equal(order().length,80);begin(1);pointer('pointermove',545);assert.equal($('#landing').dataset.target,'79');pointer('pointerup',545);assert.equal(order().at(-1),'c1');$('#undo').click();assert.equal(order()[1],'c1');pass('80-comment list reaches last item in one drag');
  scenario('short');const grip=$('.grip');grip.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
  aligned();key('End');assert.equal($('#landing').dataset.target,'4');aligned();key('Enter');assert.equal(order().at(-1),'c0');$('#undo').click();assert.equal(order()[0],'c0');pass('short-list keyboard start, endpoint alignment, commit and undo');
  assert.deepEqual(errors,[]); console.log(`${checks} checks passed; simulated geometry only.`);
} finally {window.close();}
