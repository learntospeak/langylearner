// Lightweight outfit preview helper for model-viewer (no frameworks)
// Attaches equipped accessories (by slot) into the base model's scene.
(function (global) {
  function getRoot(mv){
    try {
      // Support model-viewer v3 (mv.model.scene) and v4 (mv.scene)
      return (mv?.model?.scene) || (mv?.scene) || (mv?.model) || null;
    } catch { return null; }
  }
  function ensureLoaded(mv){
    return new Promise(res=>{
      try { if (mv && (mv.model || mv.scene)) return res(); } catch {}
      mv?.addEventListener?.('load', ()=>res(), { once:true });
    });
  }
  async function loadGLB(src){
    try { if (window.customElements && window.customElements.whenDefined) await window.customElements.whenDefined('model-viewer'); } catch {}
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', src);
    mv.setAttribute('reveal','auto');
    mv.setAttribute('preload','true');
    mv.style.position = 'absolute'; mv.style.left = '-9999px'; mv.style.top = '0'; mv.style.width = '1px'; mv.style.height = '1px';
    document.body.appendChild(mv);
    await new Promise(res=>{
      let settled = false;
      const done = ()=>{ if (settled) return; settled=true; res(); };
      try { mv.addEventListener('scene-graph-ready', done, { once:true }); } catch {}
      try { mv.addEventListener('load', done, { once:true }); } catch {}
      // Fallback poll
      let t0 = Date.now();
      (function poll(){
        try { if (mv && mv.model && (mv.model.scene || mv.scene)) return done(); } catch {}
        if (Date.now() - t0 > 7000) return done();
        try { window.requestAnimationFrame(poll); } catch { setTimeout(poll, 50); }
      })();
    });
    try { await mv.updateComplete; } catch {}
    return mv;
  }
  function defaultScaleFor(slot){ return (slot==='top'||slot==='torso'||slot==='body') ? 0.25 : 0.2; }

  function create(opts){
    const state = { mv: opts.mv, equipped:{}, items:[], cache:new Map(), attached:[], overrides: (opts.overrides||{}) };
    async function attachAll(){
      const mv = state.mv; await ensureLoaded(mv); const root = getRoot(mv); if(!root) return false;
      try { (state.attached||[]).forEach(o=>{ try{ root.remove(o); }catch{} }); } catch {}
      state.attached = [];
      const eq = state.equipped||{}; const items = new Map((state.items||[]).map(i=>[i.id, i]));
      // Compute base center to match Anchor Tool's recentered coordinate space
      let baseCenter = null; try {
        const THREE = (window.__THREE||window.THREE);
        if (THREE && root) {
          const bb = new THREE.Box3().setFromObject(root);
          baseCenter = bb.getCenter(new THREE.Vector3());
        }
      } catch {}
      const slots = Object.keys(eq||{}).filter(s=>s!=='model');
      for (const slot of slots){
        const it = items.get(eq[slot]); if(!it || !it.model) continue;
        let rec = state.cache.get(it.id);
        if (!rec){ const mvAcc = await loadGLB(it.model); rec = { mv: mvAcc }; state.cache.set(it.id, rec); }
        const srcScene = (rec.mv?.model?.scene) || (rec.mv?.scene) || (rec.mv?.model) || null; if(!srcScene || !srcScene.clone) continue;
        const obj = srcScene.clone(true);
        // Wrap and center like the Anchor Tool so transforms behave as expected
        const THREE = (window.__THREE||window.THREE);
        const wrap = new (THREE?.Group||function(){})();
        try {
          const box = new THREE.Box3().setFromObject(obj);
          const c = box.getCenter(new THREE.Vector3());
          if (slot==='boots' || slot==='feet') {
            obj.position.x -= c.x; obj.position.z -= c.z;
            const btm = new THREE.Box3().setFromObject(obj);
            obj.position.y -= btm.min.y; // bottom align
          } else {
            obj.position.sub(c);
          }
        } catch {}
        try { wrap.add(obj); } catch {}
        // Apply per-item override first, then per-slot, then defaults
        const ovs = (state.overrides||{});
        const ovItem = ovs[it.id];
        const ovSlot = ovs[slot];
        const defaults = (window.SLOT_ANCHORS || window.SLOT_ANCHORS_DEFAULT || {});
        const base = defaults[slot] || defaults.misc || { position:[0,0.05,0], rotation:[0,0,0], scale:[1,1,1] };
        const a = ovItem || ovSlot || base;
        const s = (a.scale && a.scale[0]) ? a.scale[0] : defaultScaleFor(slot);
        try { wrap.scale.set(s,s,s); } catch {}
        try {
          const ox = a.position?.[0]||0, oy = a.position?.[1]||0.05, oz = a.position?.[2]||0;
          if (baseCenter) { wrap.position.set(ox - baseCenter.x, oy - baseCenter.y, oz - baseCenter.z); }
          else { wrap.position.set(ox, oy, oz); }
        } catch {}
        try { wrap.rotation.order='XYZ'; wrap.rotation.set(a.rotation?.[0]||0, a.rotation?.[1]||0, a.rotation?.[2]||0); } catch {}
        try { console.log('[ofp] used anchor for', slot, it.id, ( ovItem ? 'item' : (ovSlot ? 'slot' : 'default') ), a); } catch {}
        try { root.add(wrap); state.attached.push(wrap); } catch {}
      }
      return state.attached.length>0;
    }
    function update(equipped, items){ state.equipped = equipped||{}; state.items = items||[]; }
    function setOverrides(map){ state.overrides = map||{}; }
    function getNodeNames(){ try { const names=[]; const r=getRoot(state.mv); r?.traverse?.(o=>{ if(o && o.name) names.push(o.name); }); return names; } catch { return []; } }
    return { update, attachAll, setOverrides, getNodeNames, state };
  }

  global.OutfitPreview = { create };
})(window);
