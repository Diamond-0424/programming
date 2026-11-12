// Loaded before either renderer. No global Math.random override.
(() => {
  const query=new URLSearchParams(location.search);
  globalThis.drifterExperiment={low:query.get('quality')==='low'||location.pathname.endsWith('three.html'),benchmark:query.has('bench'),seed:42};
  globalThis.seededRandom=(seed=42)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
})();
