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
  async function loadSceneWithThree(src){
    try {
      if (!window.__GLTFLoader) return null;
      const loader = new window.__GLTFLoader();
      const gltf = await new Promise((res)=>{
        try { loader.load(src, (g)=>res(g), undefined, ()=>res(null)); } catch { res(null); }
      });
      return (gltf && gltf.scene) ? gltf.scene : null;
    } catch { return null; }
  }
  function defaultScaleFor(slot){ return (slot==='top'||slot==='torso'||slot==='body') ? 0.25 : 0.2; }
  function isItemCompatibleWithModel(it, modelId){
    try {
      if (!it) return false;
      if (it.kind==='upgrade' || it.slot==='model') return true;
      const list = it.compatibleWith;
      if (!Array.isArray(list) || !list.length) return true;
      return list.includes(modelId);
    } catch { return true; }
  }

  function create(opts){
    const state = { mv: opts.mv, equipped:{}, items:[], cache:new Map(), attached:[], overrides: (opts.overrides||{}) };
    async function attachAll(){
      const mv = state.mv; await ensureLoaded(mv); const root = getRoot(mv); if(!root) return false;
      try { (state.attached||[]).forEach(o=>{ try{ root.remove(o); }catch{} }); } catch {}
      state.attached = [];
      const eq = state.equipped||{}; const items = new Map((state.items||[]).map(i=>[i.id, i]));
      const modelId = String(eq.model||'model-basemesh');
      const modelItem = items.get(modelId);
      const modelUrl = (modelItem && modelItem.model) ? String(modelItem.model) : '';
      const skipAccessories = (modelId === 'model-basemesh') || /basemeshpr\.glb$/i.test(modelUrl);
      if (skipAccessories) {
        try { console.log('[ofp] skipping accessories for basemesh', modelId, modelUrl); } catch {}
        return true;
      }
      const slots = Object.keys(eq||{}).filter(s=>s!=='model');
      try { console.log('[ofp] slots', slots); } catch {}
      for (const slot of slots){
        const raw = eq[slot];
        const ids = Array.isArray(raw) ? raw : [raw];
        for (const id of ids){
          const it = items.get(id);
          if (!isItemCompatibleWithModel(it, modelId)) { continue; }
          if(!it || !it.model) { try{ console.warn('[ofp] missing item', slot, id); }catch{} continue; }
          try { console.log('[ofp] loading', slot, id, it.model); } catch {}
          // Avoid HEAD probe (causes duplicate network); rely on loader callbacks
          let rec = state.cache.get(it.id);
          let srcScene = null;
          if (!rec){
            // Prefer Three.js loader if available
            srcScene = await loadSceneWithThree(it.model);
            if (!srcScene) {
              const mvAcc = await loadGLB(it.model);
              rec = { mv: mvAcc };
              try { console.log('[ofp] acc mv ready', !!rec.mv, !!(rec.mv&&rec.mv.model), !!(rec.mv&&rec.mv.scene)); } catch {}
              srcScene = (rec.mv?.model?.scene) || (rec.mv?.scene) || (rec.mv?.model) || null;
            }
            state.cache.set(it.id, rec || { scene: srcScene });
          } else {
            srcScene = rec.scene || (rec.mv?.model?.scene) || (rec.mv?.scene) || (rec.mv?.model) || null;
          }
          if(!srcScene || !srcScene.clone) { try{ console.warn('[ofp] no cloneable scene for', id); }catch{} continue; }
          const obj = srcScene.clone(true);
          // Wrap and center like the Anchor Tool so transforms behave as expected
          const THREE = (window.__THREE||window.THREE);
          const wrap = new (THREE?.Group||function(){})();
        try { const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); obj.position.sub(c); } catch {}
          try { wrap.add(obj); } catch {}
          // Apply per-item override first, then per-slot, then defaults
        const ovs = (state.overrides||{});
        const ovItem = ovs[it.id];
        const ovSlot = ovs[slot];
        const defaults = (window.SLOT_ANCHORS || window.SLOT_ANCHORS_DEFAULT || {});
        const base = defaults[slot] || defaults.misc || { position:[0,0.05,0], rotation:[0,0,0], scale:[1,1,1] };
        let a = ovItem || ovSlot || base;
        // Heuristic tweak: if boots lacking per-item override and id suggests generic shoes, nudge down slightly
        if (!ovItem && slot==='boots') {
          try { if (/(shoe|bottes)/i.test(String(it.id||''))) { a = { position:[a.position?.[0]||0, (a.position?.[1]||0) - 0.03, a.position?.[2]||0], rotation:a.rotation||[0,0,0], scale:a.scale||[1,1,1] }; } } catch {}
        }
        const s = (a.scale && a.scale[0]) ? a.scale[0] : defaultScaleFor(slot);
        try { wrap.scale.set(s,s,s); } catch {}
        try { wrap.position.set(a.position?.[0]||0, a.position?.[1]||0.05, a.position?.[2]||0); } catch {}
          try { wrap.rotation.order='XYZ'; wrap.rotation.set(a.rotation?.[0]||0, a.rotation?.[1]||0, a.rotation?.[2]||0); } catch {}
          try { console.log('[ofp] used anchor for', slot, it.id, ( ovItem ? 'item' : (ovSlot ? 'slot' : 'default') ), a); } catch {}
          let added = false;
          try { root.add(wrap); added = (wrap.parent === root); } catch (e) { added = false; }
          if (!added) {
            // Fallback: load via offscreen model-viewer to match model-viewer's THREE instance
            try {
              const mvAcc2 = await loadGLB(it.model);
              const scene2 = (mvAcc2?.model?.scene) || (mvAcc2?.scene) || (mvAcc2?.model) || null;
              if (scene2 && scene2.clone) {
                const obj2 = scene2.clone(true);
                const THREE2 = (window.__THREE||window.THREE);
                const WrapCtor = (THREE2 && THREE2.Group) ? THREE2.Group : function(){};
                const wrap2 = new WrapCtor();
                try { const box2 = new (window.__THREE||window.THREE).Box3().setFromObject(obj2); const c2 = box2.getCenter(new (window.__THREE||window.THREE).Vector3()); obj2.position.sub(c2); } catch {}
                try { wrap2.add(obj2); } catch {}
                try { wrap2.scale.set(s,s,s); } catch {}
                try { wrap2.position.set(a.position?.[0]||0, a.position?.[1]||0.05, a.position?.[2]||0); } catch {}
                try { wrap2.rotation.order='XYZ'; wrap2.rotation.set(a.rotation?.[0]||0, a.rotation?.[1]||0, a.rotation?.[2]||0); } catch {}
                try { root.add(wrap2); added = (wrap2.parent === root); if (added) wrap.__skip = true; wrap2.__ofp = true; if (added) state.attached.push(wrap2); } catch {}
              }
            } catch (e) { /* ignore */ }
          } else {
            state.attached.push(wrap);
          }
        }
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
