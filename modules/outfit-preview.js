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
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', src);
    mv.style.display = 'none';
    document.body.appendChild(mv);
    await new Promise(res=> mv.addEventListener('load', res, { once:true }));
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
      const slots = Object.keys(eq||{}).filter(s=>s!=='model');
      for (const slot of slots){
        const it = items.get(eq[slot]); if(!it || !it.model) continue;
        let rec = state.cache.get(it.id);
        if (!rec){ const mvAcc = await loadGLB(it.model); rec = { mv: mvAcc }; state.cache.set(it.id, rec); }
    const srcScene = (rec.mv?.model?.scene) || (rec.mv?.scene) || (rec.mv?.model) || null; if(!srcScene || !srcScene.clone) continue;
        const obj = srcScene.clone(true);
        // Apply overrides or defaults
        const ov = (state.overrides && state.overrides[slot]) || null;
        const s = ov && ov.scale ? (ov.scale[0]||1) : defaultScaleFor(slot);
        obj.scale.set(s,s,s);
        const px = ov && ov.position ? ov.position[0] : 0;
        const py = ov && ov.position ? ov.position[1] : 0.05;
        const pz = ov && ov.position ? ov.position[2] : 0;
        obj.position.set(px, py, pz);
        const rx = ov && ov.rotation ? ov.rotation[0] : 0;
        const ry = ov && ov.rotation ? ov.rotation[1] : 0;
        const rz = ov && ov.rotation ? ov.rotation[2] : 0;
        obj.rotation.set(rx, ry, rz);
        try { root.add(obj); state.attached.push(obj); } catch {}
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
