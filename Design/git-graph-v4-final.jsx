import { useState, useMemo } from "react";

const C = {
  bg0: "#0d1117", bg1: "#161b22", bg2: "#1c2129", bg3: "#21262d",
  border: "#30363d", borderSub: "#21262d",
  fg: "#c9d1d9", fgDim: "#6e7681", fgMut: "#484f58", fgHi: "#e6edf3",
  accent: "#2f81f7",
  sel: "rgba(47,129,247,0.10)", hov: "rgba(136,198,255,0.04)",
  b: ["#f78166","#58a6ff","#7ee787","#d2a8ff","#ffa657","#79c0ff","#f778ba","#a5d6ff"],
  ahead: "#56d364", behind: "#f85149", synced: "#58a6ff", noUp: "#484f58",
  tagBg: "rgba(210,168,255,0.10)", tagBd: "rgba(210,168,255,0.25)", tagFg: "#d2a8ff",
};
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const M = "'SF Mono','Fira Code','JetBrains Mono',Consolas,monospace";

// ─── Topology: carefully ordered so main is a straight line, branches fork right ───
// Lane 0 = master (always straight vertical)
// Lane 1-4 = feature branches that fork off and merge back
const COMMITS = [
  // Most recent at top
  { h:"a1b2c3d", m:"feat(local-ahead): v1", a:"Liu Quandong", d:0,  lane:1, parents:["b2c3d4e"], refs:["feature/local-ahead-origin","origin/feature/local-ahead-origin"], tags:[], merge:false },
  { h:"b2c3d4e", m:"docs(agents): add rule to update AGENTS", a:"Liu Quandong", d:0, lane:0, parents:["c3d4e5f"], refs:["upstream/master","origin/master","master"], tags:[], merge:false },
  { h:"c3d4e5f", m:"docs: update AGENTS.md for simplified 4-branch layout", a:"Liu Quandong", d:1, lane:0, parents:["d4e5f6a"], refs:[], tags:[], merge:false },
  { h:"d4e5f6a", m:"docs: fix ahead count for feature/mixed-sync", a:"Liu Quandong", d:1, lane:0, parents:["e5f6a7b"], refs:[], tags:[], merge:false },
  { h:"e5f6a7b", m:"Merge pull request #17 from lqdflying/develop", a:"Liu Quandong", d:2, lane:0, parents:["f6a7b8c","x1merge"], refs:[], tags:[], merge:true },
  { h:"x1merge", m:"docs: add ahead/behind remote simulation section", a:"Liu Quandong", d:2, lane:2, parents:["f6a7b8c"], refs:[], tags:[], merge:false },
  { h:"f6a7b8c", m:"Merge pull request #15 from lqdflying/master", a:"Liu Quandong", d:3, lane:0, parents:["g7b8c9d"], refs:[], tags:[], merge:true },
  { h:"g7b8c9d", m:"docs: add AGENTS.md for agent context", a:"Liu Quandong", d:3, lane:0, parents:["h8c9d0e"], refs:[], tags:[], merge:false },
  { h:"h8c9d0e", m:"Merge pull request #14 from lqdflying/release/v1.2.0", a:"Liu Quandong", d:4, lane:0, parents:["i9d0e1f","y2merge"], refs:[], tags:[], merge:true },
  { h:"y2merge", m:"chore(release): bump version to 1.2.0", a:"Liu Quandong", d:4, lane:3, parents:["i9d0e1f"], refs:[], tags:["v1.2.0"], merge:false },
  { h:"i9d0e1f", m:"Merge pull request #13 from lqdflying/feature/logging", a:"Liu Quandong", d:5, lane:0, parents:["j0e1f2a","z3merge"], refs:[], tags:[], merge:true },
  { h:"z3merge", m:"feat(logging): add log levels to helper", a:"Liu Quandong", d:5, lane:1, parents:["j0e1f2a"], refs:[], tags:[], merge:false },
  { h:"j0e1f2a", m:"Merge pull request #12 from lqdflying/feature/i18n", a:"Liu Quandong", d:5, lane:0, parents:["k1f2a3b","w4merge"], refs:[], tags:[], merge:true },
  { h:"w4merge", m:"feat(i18n): add supported locales", a:"Liu Quandong", d:5, lane:2, parents:["w5chain"], refs:[], tags:[], merge:false },
  { h:"w5chain", m:"feat(i18n): add translate function", a:"Liu Quandong", d:6, lane:2, parents:["w6chain"], refs:[], tags:[], merge:false },
  { h:"w6chain", m:"feat(i18n): add internationalization support", a:"Dylan Teo", d:6, lane:2, parents:["k1f2a3b"], refs:[], tags:[], merge:false },
  { h:"k1f2a3b", m:"Merge pull request #11 from lqdflying/feature/config-refactor", a:"Liu Quandong", d:6, lane:0, parents:["l2a3b4c","v7merge"], refs:[], tags:[], merge:true },
  { h:"v7merge", m:"feat(analytics): analytics v2 update", a:"Dylan Teo", d:6, lane:1, parents:["v8chain"], refs:[], tags:[], merge:false },
  { h:"v8chain", m:"refactor(config): refactor config structure", a:"Dylan Teo", d:7, lane:1, parents:["l2a3b4c"], refs:[], tags:[], merge:false },
];

const BRANCHES_SIDEBAR = [
  { name: "All branches", type: "header" },
  { name: "feature/local-ahead-origin", type: "local", color: C.b[1],
    subs: ["origin/feature/local-ahead-origin", "upstream/feature/local-ahead-..."] },
  { name: "feature/local-only", type: "local", color: C.b[2], subs: [] },
  { name: "feature/remote-ahead-or...", type: "local", color: C.b[3], current: true,
    subs: ["origin/feature/remote-ahead-o...", "upstream/feature/remote-ahea..."] },
  { name: "feature/single-remote", type: "local", color: C.b[4],
    subs: ["origin/feature/single-remote"] },
  { name: "master", type: "local", color: C.b[0],
    subs: ["origin/master", "upstream/master"] },
  { name: "REMOTE-ONLY", type: "section" },
  { name: "origin", type: "remote-group" },
  { name: "feature/remote-only", type: "remote-ref", color: C.b[5] },
];

// Branch tracking data
const TRACK_BRANCHES = [
  { name: "feature/local-ahead-ori...", color: C.b[1], remotes: [
    { r: "origin", ref: "origin/feature/local-ahea...", a: 0, b: 0, badge: null },
    { r: "upstream", ref: "upstream/feature/local-ahead-ori...", a: 2, b: 0, badge: "upstream" },
  ]},
  { name: "feature/local-only", color: C.b[2], remotes: [] },
  { name: "feature/remote-ahead-or...", color: C.b[3], current: true, remotes: [
    { r: "origin", ref: "origin/feature/remote-ahe...", a: 0, b: 2, badge: "upstream" },
    { r: "upstream", ref: "upstream/feature/remote-ahead-or...", a: 0, b: 0, badge: null },
  ]},
  { name: "feature/single-remote", color: C.b[4], remotes: [
    { r: "origin", ref: "origin/feature/single-remote", a: 0, b: 0, badge: null },
  ]},
  { name: "master", color: C.b[0], current: false, remotes: [
    { r: "origin", ref: "origin/master", a: 0, b: 0, badge: null },
    { r: "upstream", ref: "upstream/master", a: 0, b: 0, badge: null },
  ]},
];

const REMOTES_INFO = [
  { name: "origin", url: "git@github.com:lqdflying/git-sample1.git", color: C.b[1] },
  { name: "upstream", url: "git@github.com:lqdflying/git-sample2.git", color: C.b[0] },
];

// ─── Helpers ───
const today = new Date("2026-06-13T23:59:59");
const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
const relT = d => { const s = Math.floor((today - d)/1000); return s<3600?`${Math.floor(s/60)}m`:s<86400?`${Math.floor(s/3600)}h`:s<604800?`${Math.floor(s/86400)}d`:`${Math.floor(s/604800)}w`; };
const Avatar = ({name,size=20}) => { const i=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); const h=[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%360; return <div style={{width:size,height:size,borderRadius:"50%",background:`hsl(${h},45%,32%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.42,fontWeight:600,color:`hsl(${h},55%,75%)`,flexShrink:0}}>{i}</div>; };

// ─── Graph Canvas: topology-aware S-curves ───
const LW = 22, RH = 32, NR = 4;
function GraphCanvas({ commits, selHash, onSel }) {
  const W = 5 * LW + 14, H = commits.length * RH + 12;
  const lx = l => l * LW + LW/2 + 7;
  const ry = i => i * RH + RH/2 + 6;
  const idx = useMemo(() => { const m={}; commits.forEach((c,i)=>{m[c.h]=i;}); return m; }, [commits]);

  // Build edges
  const edges = useMemo(() => {
    const e = [];
    commits.forEach((c, i) => {
      (c.parents||[]).forEach(ph => {
        if (idx[ph] !== undefined) {
          const pi = idx[ph];
          e.push({ l1: c.lane, l2: commits[pi].lane, y1: i, y2: pi, color: C.b[c.lane % 8] });
        }
      });
    });
    return e;
  }, [commits, idx]);

  // Render edge path: clean S-curves that avoid overlap
  const edgePath = (e) => {
    const x1 = lx(e.l1), y1 = ry(e.y1), x2 = lx(e.l2), y2 = ry(e.y2);
    if (e.l1 === e.l2) return `M${x1},${y1} L${x2},${y2}`;
    // S-curve: go down one row from source, then curve horizontally, then straight to target
    const step = RH * 0.7;
    const midY = y1 + step;
    return `M${x1},${y1} L${x1},${midY} Q${x1},${midY + (y2-midY)*0.15} ${x2},${midY + (y2-midY)*0.3} L${x2},${y2}`;
  };

  return (
    <svg width={W} height={H} style={{ flexShrink: 0, display: "block" }}>
      <defs>
        {C.b.map((c,i) => (
          <filter key={i} id={`g${i}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        ))}
      </defs>
      {/* Vertical lane guides (very subtle) */}
      {[0,1,2,3,4].map(i => <line key={i} x1={lx(i)} y1={0} x2={lx(i)} y2={H} stroke={C.b[i%8]} strokeWidth={0.5} opacity={0.06}/>)}
      {/* Edges - back to front for proper layering */}
      {[...edges].reverse().map((e, i) => (
        <path key={i} d={edgePath(e)} stroke={e.color} strokeWidth={2} fill="none" opacity={0.55} strokeLinecap="round" filter={e.l1!==e.l2?`url(#g${e.l1%8})`:undefined}/>
      ))}
      {/* Nodes */}
      {commits.map((c, i) => {
        const cx = lx(c.lane), cy = ry(i), col = C.b[c.lane%8], sel = c.h===selHash;
        const isHead = c.refs.some(r => !r.startsWith("origin/") && !r.startsWith("upstream/") && r !== "HEAD");
        return (
          <g key={c.h} onClick={()=>onSel(c.h)} style={{cursor:"pointer"}}>
            {sel && <circle cx={cx} cy={cy} r={NR+6} fill={col} opacity={0.12}/>}
            {c.merge ? (
              <>
                <circle cx={cx} cy={cy} r={NR+1} fill="none" stroke={col} strokeWidth={1.8} opacity={0.6}/>
                <circle cx={cx} cy={cy} r={NR-1.5} fill={col} opacity={0.85}/>
              </>
            ) : (
              <circle cx={cx} cy={cy} r={NR} fill={isHead?col:C.bg0} stroke={col} strokeWidth={2}/>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Badges ───
const RefBadge = ({text,color}) => <span style={{fontSize:10.5,padding:"1px 8px",borderRadius:10,border:`1px solid ${color||C.accent}44`,background:`${color||C.accent}12`,color:color||C.accent,fontFamily:M,fontWeight:500,whiteSpace:"nowrap",flexShrink:0,lineHeight:"18px",display:"inline-block"}}>{text}</span>;
const TagBadge = ({text}) => <span style={{fontSize:10.5,padding:"1px 8px",borderRadius:10,border:`1px solid ${C.tagBd}`,background:C.tagBg,color:C.tagFg,fontFamily:M,fontWeight:500,whiteSpace:"nowrap",flexShrink:0,lineHeight:"18px",display:"inline-flex",alignItems:"center",gap:3}}>
  <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke={C.tagFg} strokeWidth={1.5}><path d="M2 8.5V3.5a1 1 0 011-1h5l5.5 5.5a1 1 0 010 1.41L9.41 13.5a1 1 0 01-1.41 0L2 8.5z"/><circle cx="5.5" cy="5.5" r=".8" fill={C.tagFg}/></svg>{text}</span>;
const CurBadge = () => <span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:"#f8514922",color:"#f85149",fontWeight:600,fontFamily:M,flexShrink:0}}>current</span>;

// ─── MAIN ───
export default function App() {
  const [tab, setTab] = useState("graph");
  const [sel, setSel] = useState(COMMITS[0].h);
  const [hov, setHov] = useState(null);
  const [preset, setPreset] = useState(7);
  const [sideW] = useState(210);
  const selC = COMMITS.find(c=>c.h===sel);

  const filtered = useMemo(() => {
    if (preset === null) return COMMITS;
    const cut = daysAgo(preset);
    return COMMITS.filter(c => daysAgo(c.d) >= cut);
  }, [preset]);

  return (
    <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:C.bg0,color:C.fg,fontFamily:F,fontSize:13,overflow:"hidden",userSelect:"none"}}>

      {/* Title */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:C.bg1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:C.accent}}/>
        <span style={{fontWeight:600,fontSize:13,color:C.fgHi}}>Git Graph</span>
        <span style={{fontSize:11.5,color:C.fgDim,padding:"2px 8px",background:C.bg3,borderRadius:6,fontFamily:M}}>git-sample</span>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",padding:"0 14px",borderBottom:`1px solid ${C.border}`,background:C.bg1,flexShrink:0}}>
        {[["graph","\u2B24 Commit Graph"],["branches","\u2B24 Branch Tracking"]].map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:tab===k?600:400,color:tab===k?C.fgHi:C.fgDim,borderBottom:tab===k?`2px solid ${C.accent}`:"2px solid transparent"}}>{l}</div>
        ))}
      </div>

      {/* Body */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {tab === "graph" ? (
          <>
            {/* ── Branch sidebar ── */}
            <div style={{width:sideW,borderRight:`1px solid ${C.border}`,background:C.bg1,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
              <div style={{padding:"8px 10px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,fontWeight:700,color:C.fgMut,letterSpacing:.6,textTransform:"uppercase"}}>Branches</span>
                <span style={{fontSize:13,color:C.fgDim,cursor:"pointer"}}>&lsaquo;</span>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 0 8px"}}>
                {BRANCHES_SIDEBAR.map((b,i) => {
                  if (b.type === "header") return <div key={i} style={{padding:"4px 10px",fontSize:12,fontWeight:600,color:C.fgHi}}>{b.name}</div>;
                  if (b.type === "section") return <div key={i} style={{padding:"10px 10px 4px",fontSize:10,fontWeight:700,color:C.fgMut,letterSpacing:.6,textTransform:"uppercase"}}>{b.name}</div>;
                  if (b.type === "remote-group") return <div key={i} style={{padding:"2px 10px",fontSize:11.5,color:C.fgDim}}>{b.name}</div>;
                  const isRemote = b.type === "remote-ref";
                  const indent = isRemote ? 24 : b.subs ? 0 : 0;
                  return (
                    <div key={i}>
                      <div style={{padding:"3px 10px 3px "+(10+indent)+"px",display:"flex",alignItems:"center",gap:6,fontSize:12,color:isRemote?C.fgDim:C.fgHi,borderLeft:isRemote?`2px solid ${b.color||C.fgDim}`:`2px solid transparent`}}>
                        {!isRemote && <div style={{width:7,height:7,borderRadius:"50%",background:b.color,flexShrink:0}}/>}
                        {isRemote && <div style={{width:5,height:5,borderRadius:"50%",background:b.color||C.fgDim,flexShrink:0,marginLeft:2}}/>}
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{b.name}</span>
                        {b.current && <CurBadge/>}
                      </div>
                      {/* Sub refs */}
                      {b.subs && b.subs.map((s,si) => (
                        <div key={si} style={{padding:"2px 10px 2px 30px",fontSize:11,color:C.fgDim,display:"flex",alignItems:"center",gap:4}}>
                          <div style={{width:4,height:4,borderRadius:"50%",background:C.fgMut}}/>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Graph main ── */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {/* Date range */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderBottom:`1px solid ${C.borderSub}`,flexShrink:0}}>
                <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke={C.fgDim} strokeWidth={1.5}><rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="7" x2="14" y2="7"/><line x1="5" y1="1" x2="5" y2="4"/><line x1="11" y1="1" x2="11" y2="4"/></svg>
                {[{l:"7d",d:7},{l:"14d",d:14},{l:"30d",d:30},{l:"All",d:null}].map(p=>(
                  <div key={p.l} onClick={()=>setPreset(p.d)} style={{fontSize:11,padding:"2px 10px",borderRadius:6,cursor:"pointer",fontWeight:600,background:preset===p.d?C.accent:"transparent",color:preset===p.d?"#fff":C.fgDim}}>{p.l}</div>
                ))}
                <span style={{marginLeft:4,fontSize:11,color:C.fgDim}}>Custom</span>
                <div style={{flex:1}}/>
                <span style={{fontSize:11,color:C.fgMut}}>{filtered.length} commits</span>
              </div>

              {/* Headers */}
              <div style={{display:"flex",padding:"5px 0",borderBottom:`1px solid ${C.borderSub}`,fontSize:10.5,color:C.fgMut,fontWeight:600,flexShrink:0,letterSpacing:.3}}>
                <div style={{width:122,paddingLeft:14,flexShrink:0}}>Graph</div>
                <div style={{flex:1}}>Description</div>
              </div>

              {/* Rows */}
              <div style={{flex:1,overflowY:"auto"}}>
                <div style={{display:"flex"}}>
                  <div style={{width:122,flexShrink:0}}><GraphCanvas commits={filtered} selHash={sel} onSel={setSel}/></div>
                  <div style={{flex:1}}>
                    {filtered.map(c => {
                      const s = c.h===sel, h = hov===c.h, col = C.b[c.lane%8];
                      const displayRefs = c.refs.filter(r => r !== "HEAD");
                      return (
                        <div key={c.h} onClick={()=>setSel(c.h)} onMouseEnter={()=>setHov(c.h)} onMouseLeave={()=>setHov(null)}
                          style={{height:RH,display:"flex",alignItems:"center",cursor:"pointer",background:s?C.sel:h?C.hov:"transparent",borderLeft:s?`2px solid ${col}`:"2px solid transparent",paddingRight:14}}>
                          <div style={{flex:1,display:"flex",alignItems:"center",gap:5,overflow:"hidden",paddingLeft:4}}>
                            {displayRefs.map(ref => <RefBadge key={ref} text={ref} color={ref.startsWith("origin/")||ref.startsWith("upstream/")?C.fgDim:col}/>)}
                            {c.tags.map(t => <TagBadge key={t} text={t}/>)}
                            <span style={{fontSize:12,color:s?C.fgHi:c.merge?C.fgDim:C.fg,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.m}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Detail ── */}
            {selC && (
              <div style={{width:260,borderLeft:`1px solid ${C.border}`,background:C.bg1,flexShrink:0,overflowY:"auto"}}>
                <div style={{padding:"14px 14px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <Avatar name={selC.a} size={28}/>
                    <div><div style={{fontSize:12.5,fontWeight:600,color:C.fgHi}}>{selC.a}</div><div style={{fontSize:10.5,color:C.fgDim}}>{relT(daysAgo(selC.d))} ago</div></div>
                  </div>
                  <p style={{fontSize:12.5,color:C.fgHi,lineHeight:1.5,margin:"0 0 10px"}}>{selC.m}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                    {selC.refs.map(r=><RefBadge key={r} text={r} color={C.b[selC.lane%8]}/>)}
                    {selC.tags.map(t=><TagBadge key={t} text={t}/>)}
                  </div>
                  <div style={{fontSize:11,lineHeight:2.2}}>
                    <div style={{display:"flex"}}><span style={{width:50,color:C.fgMut}}>SHA</span><span style={{fontFamily:M,color:C.fg}}>{selC.h}</span></div>
                    <div style={{display:"flex"}}><span style={{width:50,color:C.fgMut}}>Parents</span><span style={{fontFamily:M,color:C.fg}}>{selC.parents.join(" ")}</span></div>
                    {selC.merge && <div style={{display:"flex"}}><span style={{width:50,color:C.fgMut}}>Type</span><span style={{color:C.fgDim}}>Merge commit</span></div>}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ══════ BRANCH TRACKING ══════ */
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{flex:1,overflowY:"auto"}}>
              {/* Header */}
              <div style={{padding:"16px 24px 8px"}}>
                <div style={{fontSize:15,fontWeight:600,color:C.fgHi}}>Branch Tracking</div>
                <div style={{fontSize:12,color:C.fgDim,marginTop:2}}>Local branches and upstream remotes</div>
              </div>

              {/* Remote chips */}
              <div style={{display:"flex",gap:10,padding:"8px 24px 16px"}}>
                {REMOTES_INFO.map(r=>(
                  <div key={r.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderRadius:8,background:C.bg2,border:`1px solid ${C.borderSub}`}}>
                    <div style={{width:9,height:9,borderRadius:"50%",background:r.color}}/>
                    <span style={{fontSize:12,fontWeight:600,color:C.fgHi}}>{r.name}</span>
                    <span style={{fontSize:10.5,color:C.fgMut,fontFamily:M}}>{r.url}</span>
                  </div>
                ))}
              </div>

              {/* Column headers */}
              <div style={{display:"flex",alignItems:"center",padding:"0 24px 8px",fontSize:10.5,fontWeight:600,color:C.fgMut,letterSpacing:.5,textTransform:"uppercase"}}>
                <div style={{width:220}}>Local</div>
                <div style={{width:100,textAlign:"center"}}>Tracks</div>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:4}}>
                  <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke={C.fgMut} strokeWidth={1.5}><circle cx="8" cy="3.5" r="2"/><path d="M3 14c0-3 2-5.5 5-5.5s5 2.5 5 5.5"/></svg>
                  Remotes
                </div>
              </div>

              {/* Tracking rows */}
              <div style={{padding:"0 24px"}}>
                {TRACK_BRANCHES.map(b => {
                  const rowH = Math.max(b.remotes.length, 1) * 36 + 12;
                  return (
                    <div key={b.name} style={{display:"flex",alignItems:"center",minHeight:rowH,borderBottom:`1px solid ${C.borderSub}`,padding:"8px 0"}}>
                      {/* LOCAL */}
                      <div style={{width:220,flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 12px",borderRadius:8,background:C.bg3,border:`1px solid ${C.borderSub}`,maxWidth:200}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600,color:C.fgHi,fontFamily:M,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
                        </div>
                        {b.current && <CurBadge/>}
                      </div>

                      {/* ARROWS + STATUS */}
                      <div style={{width:100,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                        {b.remotes.length === 0 ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <svg width={48} height={2}><line x1={0} y1={1} x2={48} y2={1} stroke={C.noUp} strokeWidth={1.2} strokeDasharray="4,3"/></svg>
                            <span style={{fontSize:10,color:C.noUp,fontStyle:"italic"}}>no upstream</span>
                          </div>
                        ) : b.remotes.map((r,ri) => {
                          const rc = REMOTES_INFO.find(rm=>rm.name===r.r)?.color||C.fgDim;
                          return (
                            <div key={ri} style={{display:"flex",alignItems:"center",gap:3,height:28}}>
                              {(r.a>0) && <span style={{fontSize:10.5,fontWeight:700,color:C.ahead,fontFamily:M}}>+{r.a}</span>}
                              <svg width={36} height={12}><line x1={0} y1={6} x2={28} y2={6} stroke={rc} strokeWidth={1.5} opacity={0.6}/><polygon points="31,6 26,3 26,9" fill={rc} opacity={0.7}/></svg>
                              {(r.a===0&&r.b===0) && <svg width={14} height={14} viewBox="0 0 16 16"><polyline points="4,8.5 7,11 12,5" fill="none" stroke={C.synced} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              {(r.b>0) && <span style={{fontSize:10.5,fontWeight:700,color:C.behind,fontFamily:M}}>-{r.b}</span>}
                            </div>
                          );
                        })}
                      </div>

                      {/* REMOTES */}
                      <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                        {b.remotes.length === 0 ? (
                          <span style={{fontSize:11,color:C.noUp}}>-</span>
                        ) : b.remotes.map((r,ri) => {
                          const rc = REMOTES_INFO.find(rm=>rm.name===r.r)?.color||C.fgDim;
                          return (
                            <div key={ri} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:C.bg3,border:`1px solid ${C.borderSub}`,maxWidth:340,height:28}}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:rc,flexShrink:0}}/>
                              <span style={{fontSize:11,color:C.fgDim,fontFamily:M,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.ref}</span>
                              {r.badge && <span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:`${rc}22`,color:rc,fontWeight:600,fontFamily:M,flexShrink:0}}>{r.badge}</span>}
                              {(r.a>0) && <span style={{fontSize:10,fontWeight:700,color:C.ahead,fontFamily:M,flexShrink:0}}>+{r.a}</span>}
                              {(r.b>0) && <span style={{fontSize:10,fontWeight:700,color:C.behind,fontFamily:M,flexShrink:0}}>-{r.b}</span>}
                              {(r.a===0&&r.b===0) && <svg width={14} height={14} viewBox="0 0 16 16" style={{flexShrink:0}}><polyline points="4,8.5 7,11 12,5" fill="none" stroke={C.synced} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{padding:"14px 24px",display:"flex",gap:18,flexWrap:"wrap"}}>
                {[[C.ahead,"+N ahead"],[C.behind,"-N behind"],[C.synced,"synced"],[C.noUp,"untracked"],...REMOTES_INFO.map(r=>[r.color,r.name])].map(([c,l])=>(
                  <span key={l} style={{fontSize:11,color:C.fgDim,display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:c}}/>{l}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Quick Actions (sticky bottom) ── */}
            <div style={{borderTop:`1px solid ${C.border}`,background:C.bg1,flexShrink:0}}>
              {/* Contextual alert */}
              <div style={{padding:"10px 24px",borderBottom:`1px solid ${C.borderSub}`,display:"flex",alignItems:"flex-start",gap:10}}>
                <svg width={16} height={16} viewBox="0 0 16 16" style={{flexShrink:0,marginTop:2}}><polyline points="4,10 8,5 12,10" fill="none" stroke={C.behind} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div>
                  <div style={{fontSize:12.5,color:C.fgHi}}><strong>feature/remote-ahead-origin</strong> <span style={{color:C.fgDim}}>&rarr;</span> <span style={{color:C.fgDim}}>origin/feature/remote-ahead-origin</span></div>
                  <div style={{fontSize:11.5,color:C.behind,fontWeight:600,marginTop:2}}>2 commits behind</div>
                  <div style={{fontSize:11,color:C.fgDim,marginTop:1}}>Pull to fast-forward feature/remote-ahead-origin from origin/feature/remote-ahead-origin.</div>
                  <div style={{fontSize:10.5,color:C.fgMut,marginTop:2}}>Checked out: <span style={{color:C.fgDim,fontFamily:M}}>master</span></div>
                </div>
              </div>
              {/* Action buttons */}
              <div style={{display:"flex",gap:8,padding:"10px 24px",flexWrap:"wrap",alignItems:"center"}}>
                <QBtn icon="push" label="Push Selected" dim/>
                <QBtn icon="pull" label="Pull 2" highlight/>
                <QBtn icon="fetch" label="Fetch All Remotes"/>
                <QBtn icon="upstream" label="Set Upstream"/>
                <QBtn icon="prune" label="Prune Stale"/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"3px 14px",background:C.bg2,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.fgDim,flexShrink:0}}>
        <span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:C.b[0]}}/>master</span>
        <span>|</span><span>2 remotes</span><span>|</span><span>{COMMITS.length} commits</span>
        <div style={{flex:1}}/><span style={{color:C.fgMut}}>Last fetched 2m ago</span>
      </div>
    </div>
  );
}

// ── Quick action button ──
function QBtn({ icon, label, highlight, dim }) {
  const [h, setH] = useState(false);
  const icons = {
    push: <><line x1="8" y1="13" x2="8" y2="4"/><polyline points="5,7 8,4 11,7"/></>,
    pull: <><line x1="8" y1="3" x2="8" y2="12"/><polyline points="5,9 8,12 11,9"/></>,
    fetch: <><circle cx="8" cy="3.5" r="2"/><line x1="8" y1="5.5" x2="8" y2="13"/><polyline points="5.5,10.5 8,13 10.5,10.5"/></>,
    upstream: <><path d="M6 3C6 5 10 5 10 7"/><circle cx="6" cy="3" r="1.5"/><circle cx="10" cy="8.5" r="1.5"/><line x1="6" y1="10" x2="6" y2="13"/><circle cx="6" cy="13.5" r="1.2"/></>,
    prune: <><path d="M4 4l8 8M12 4l-8 8"/></>,
  };
  return (
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:highlight?600:400,
        background:highlight?C.accent:h?C.bg3:C.bg2,
        color:highlight?"#fff":dim?C.fgMut:C.fg,
        border:`1px solid ${highlight?C.accent:C.borderSub}`,
        opacity:dim?.5:1,transition:"all .1s"}}>
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={highlight?"#fff":dim?C.fgMut:C.fgDim} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">{icons[icon]}</svg>
      {label}
    </div>
  );
}
