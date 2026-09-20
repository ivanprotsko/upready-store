const B="http://localhost:9152", K=process.env.P
const call = async (q) => { const t=process.hrtime.bigint(); const r=await fetch(`${B}/store/tenant/product-attributes/facets${q}`,{headers:{"x-publishable-api-key":K,"x-medusa-locale":"ru"}}); const b=await r.json(); return {ms:Number(process.hrtime.bigint()-t)/1e6, status:r.status, count:b.count, facets:(b.facets||[]).length} }
const med = a => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)] }
for (const q of ["", "?a_attr_0=v1", "?a_num_0=100..500"]) {
  const first = await call(q)
  const rest = []
  for (let i=0;i<9;i++) rest.push((await call(q)).ms)
  console.log(`${q||"(без выбора)"} → HTTP ${first.status}, фасетов ${first.facets}, count ${first.count}; холодный ${first.ms.toFixed(1)} мс, медиана из 9 ${med(rest).toFixed(1)} мс, max ${Math.max(...rest).toFixed(1)} мс`)
}
