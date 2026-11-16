function sceneMarkup(stage){
  const palette=[
    {sky1:'#d9e4d4',sky2:'#f5deb7',hill:'#88a37f',ground1:'#b79668',ground2:'#8e6f4e',robe:'#6b4a36'},
    {sky1:'#d7e0ce',sky2:'#f1d8a9',hill:'#87a17a',ground1:'#b68f61',ground2:'#866648',robe:'#4d6a60'},
    {sky1:'#d5dfd1',sky2:'#ecd3a4',hill:'#809b79',ground1:'#b38d5f',ground2:'#845f42',robe:'#764636'},
    {sky1:'#d1ddd6',sky2:'#e7d09c',hill:'#7d9680',ground1:'#ad875d',ground2:'#7a5b40',robe:'#475f72'},
    {sky1:'#d8ddd2',sky2:'#efd7a5',hill:'#90a587',ground1:'#b69064',ground2:'#866748',robe:'#5b503e'}
  ][stage];
  let s=`<defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="${palette.sky1}"/><stop offset="1" stop-color="${palette.sky2}"/></linearGradient>
    <linearGradient id="hillGrad" x2="0" y2="1"><stop stop-color="#8aa67c"/><stop offset="1" stop-color="#657c60"/></linearGradient>
    <linearGradient id="earth" x2="0" y2="1"><stop stop-color="${palette.ground1}"/><stop offset="1" stop-color="${palette.ground2}"/></linearGradient>
    <linearGradient id="wood" x2="0" y2="1"><stop stop-color="#8a5a36"/><stop offset="1" stop-color="#53331f"/></linearGradient>
    <linearGradient id="thatch" x2="0" y2="1"><stop stop-color="#c6a367"/><stop offset="1" stop-color="#90693d"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity=".25"/></filter>
  </defs>
  <rect width="1200" height="675" fill="url(#sky)"/>
  <path d="M0 250 C120 215, 220 215, 340 245 S590 285, 740 250 S980 210, 1200 240 V340 H0 Z" fill="url(#hillGrad)"/>
  <rect y="330" width="1200" height="345" fill="url(#earth)"/>
  <path d="M505 310 L695 310 L865 675 L335 675 Z" fill="#c9b186" opacity=".95"/>
  <path d="M570 310 L600 675 M630 310 L600 675" stroke="#e6cfaa" stroke-width="5" opacity=".45"/>
  <g opacity=".65">
    <path d="M0 345 H1200" stroke="#dbc39a" stroke-width="2"/>
    <path d="M0 430 H1200" stroke="#a17f59" stroke-width="2" opacity=".45"/>
    <path d="M0 520 H1200" stroke="#a17f59" stroke-width="2" opacity=".35"/>
  </g>`;

  // main gate and board house
  s+=`<g filter="url(#shadow)">
    <rect x="383" y="178" width="434" height="148" fill="url(#wood)" rx="4"/>
    <rect x="412" y="206" width="376" height="88" fill="#e7d4ad" stroke="#8d623a" stroke-width="3"/>
    <rect x="465" y="228" width="270" height="47" fill="#2c2621" rx="4"/>
    <path d="M352 188 L600 120 L850 188 Z" fill="url(#thatch)" stroke="#65442d" stroke-width="10"/>
    <path d="M338 196 Q600 78 864 196" stroke="#6e462d" fill="none" stroke-width="8"/>
    <path d="M432 206V322 M768 206V322" stroke="#5b3520" stroke-width="24"/>
    <path d="M575 295V175 M625 295V175" stroke="#d6ba82" stroke-width="10"/>
    <rect x="546" y="155" width="108" height="36" rx="5" fill="#7f3026" stroke="#edc57f" stroke-width="3"/>
    <text x="600" y="180" font-size="21" fill="#ffeab7" font-weight="bold" text-anchor="middle">BẢNG VÀNG</text>
  </g>`;

  // flags, trees, fences
  for(let i=0;i<6;i++){
    const x=96+i*173, y=197-(i%2?6:0), c=i%2?'#b93b32':'#d8b05f';
    s+=`<g opacity=".95"><path d="M${x} ${y}V334" stroke="#6e4427" stroke-width="4"/><path d="M${x} ${y}l46 14 -46 14z" fill="${c}" stroke="#704126" stroke-width="1"/></g>`
  }
  for(let x of [35,1162]){
    s+=`<g opacity=".8"><path d="M${x} 0 L${x-15} 296" stroke="#4b5135" stroke-width="24"/><circle cx="${x+10}" cy="125" r="90" fill="#4c6d45"/><circle cx="${x-32}" cy="55" r="82" fill="#58794d"/><circle cx="${x+65}" cy="90" r="55" fill="#5b7a4d"/></g>`
  }
  for(let side of [70,1090]){
    s+=`<g opacity=".55"><path d="M${side} 340 L${side+15} 340 L${side+35} 500 L${side+22} 500Z" fill="#ad9f8b"/><path d="M${side+6} 345 h20" stroke="#746350" stroke-width="3"/></g>`
  }

  // Booth banks inspired by Nam Dinh exam field layout
  const rows=[{y:350,scale:.54},{y:426,scale:.70},{y:514,scale:.88}];
  rows.forEach((row,rowIndex)=>{
    const cols=[0,1,2,3,4];
    cols.forEach(col=>{
      [0,1].forEach(side=>{
        const baseX = side===0 ? 90 + col*92 : 650 + col*92;
        const x = 600 + (baseX-600)*row.scale;
        const y = row.y;
        const w = 88*row.scale;
        const h = 112*row.scale;
        const robe = ['#5d4636','#5f7368','#814e3c','#4f6372','#6b5643'][(col+rowIndex+side)%5];
        s+=`<g filter="url(#shadow)">
          <ellipse cx="${x+w/2}" cy="${y+h*1.02}" rx="${w*.62}" ry="${h*.18}" fill="#3c2f2430"/>
          <path d="M${x-w*.10} ${y+h*.32} Q${x+w*.42} ${y-h*.36} ${x+w*1.10} ${y+h*.32}" fill="none" stroke="#634427" stroke-width="${8*row.scale}"/>
          <path d="M${x-w*.05} ${y+h*.32} Q${x+w*.42} ${y-h*.31} ${x+w*1.05} ${y+h*.32} L${x+w*.92} ${y+h*.59} Q${x+w*.42} ${y+h*.02} ${x+w*.08} ${y+h*.59} Z" fill="#c8a46e" stroke="#876444" stroke-width="${2.6*row.scale}"/>
          <path d="M${x} ${y+h*.37}V${y+h*.93} M${x+w} ${y+h*.37}V${y+h*.93}" stroke="#69462f" stroke-width="${5*row.scale}"/>
          <rect x="${x+w*.09}" y="${y+h*.71}" width="${w*.82}" height="${h*.085}" fill="#5f422b"/>
          <rect x="${x+w*.30}" y="${y+h*.58}" width="${w*.34}" height="${h*.08}" rx="2" fill="#6e4a30"/>
          <circle cx="${x+w*.49}" cy="${y+h*.49}" r="${h*.145}" fill="#e0b28b"/>
          <ellipse cx="${x+w*.49}" cy="${y+h*.40}" rx="${w*.20}" ry="${h*.09}" fill="#252924"/>
          <path d="M${x+w*.26} ${y+h*.86}Q${x+w*.49} ${y+h*.56} ${x+w*.72} ${y+h*.86}Z" fill="${robe}"/>
        </g>`;
      });
    });
  });

  // central patrol figures
  s+=`<g filter="url(#shadow)">
    <circle cx="600" cy="490" r="13" fill="#deb08a"/>
    <path d="M585 516l15-15 20 17 -7 43h-30z" fill="#732f26"/>
    <path d="M588 527l-18 18m47-9 16 11" stroke="#563426" stroke-width="7"/>
    <path d="M587 480h27v8h-27z" fill="#1f261f"/>
    <text x="600" y="580" text-anchor="middle" font-size="15" fill="#4e3527" font-weight="bold">QUAN TRƯỜNG</text>
  </g>`;
  s+=`<g filter="url(#shadow)"><circle cx="563" cy="560" r="10" fill="#dfb18b"/><path d="M553 576 l9-10 12 10 -4 28 h-20z" fill="#7b4d39"/><path d="M551 560h20v6h-20z" fill="#212621"/></g>`;
  s+=`<g filter="url(#shadow)"><circle cx="638" cy="555" r="10" fill="#dfb18b"/><path d="M628 571 l9-10 12 10 -4 28 h-20z" fill="#5b6c73"/><path d="M626 555h20v6h-20z" fill="#212621"/></g>`;

  // foreground posts / path markers
  for(let x of [310,890]){
    s+=`<g opacity=".75"><path d="M${x} 610 l16 -66 h24 l16 66" fill="#91704b"/><path d="M${x+28} 544 v-44" stroke="#62452d" stroke-width="5"/><path d="M${x+28} 500 l20 8 -20 8z" fill="#a74134"/></g>`;
  }
  return s
}
