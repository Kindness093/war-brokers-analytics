// Four diagonal hit-marker strokes; the hotspot is the open center.
function marker(red,green,blue) {
  const color=`rgb(${red},${green},${blue})`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 3L8 8M16 16L21 21M3 21L8 16M16 8L21 3" fill="none" stroke="#111" stroke-opacity=".45" stroke-width="2.2"/><path d="M3 3L8 8M16 16L21 21M3 21L8 16M16 8L21 3" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="butt"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}
const white=marker(255,255,255),orange=marker(255,158,36);
const frames=Array.from({length:76},(_,i)=>marker(255,Math.round(45+210*i/75),Math.round(45+210*i/75)));
const style=document.createElement('style');
style.textContent='@media (pointer: fine) {html,html * {cursor:var(--wb-cursor, crosshair) !important;}}';
document.head.append(style);
const set=value=>document.documentElement.style.setProperty('--wb-cursor',value);
const interactive='a[href],button,input:not([type="hidden"]),textarea,select,summary,label,[role="button"],[role="link"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
let target=null,animation=0,fading=false,held=false;
function isClickable() {
  const control=target?.closest?.(interactive);
  return !!control && !control.matches(':disabled,[aria-disabled="true"]');
}
function resting() {set(isClickable()?orange:white);}
set(white);
document.addEventListener('pointerover',event=>{target=event.target;if(!fading && !held) resting();});
document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch') return;
  cancelAnimationFrame(animation);
  target=event.target;held=true;fading=false;set(frames[0]);
});
function release() {
  if(!held) return;
  held=false;fading=true;
  const start=performance.now();
  function fade(now) {
    const progress=Math.min(1,(now-start)/1000);
    const end=isClickable()?[255,158,36]:[255,255,255];
    set(marker(255,Math.round(45+(end[1]-45)*progress),Math.round(45+(end[2]-45)*progress)));
    if(progress<1) animation=requestAnimationFrame(fade);
    else {fading=false;resting();}
  }
  animation=requestAnimationFrame(fade);
}
document.addEventListener('pointerup',event=>{
  if(!event.buttons) release();
});
document.addEventListener('pointercancel',release);
window.addEventListener('blur',release);
// After a click finishes fading, movement restores the normal hover color.
document.addEventListener('pointermove',event=>{target=event.target;if(!fading && !held) resting();});
