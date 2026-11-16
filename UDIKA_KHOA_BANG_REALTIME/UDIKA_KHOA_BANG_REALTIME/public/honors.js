'use strict';
function scholarFigure(kind='trang-nguyen'){
 const color=kind==='trang-nguyen'?'#922f27':kind==='bang-nhan'?'#31536c':'#40654c';
 const trim=kind==='trang-nguyen'?'#e6b54c':kind==='bang-nhan'?'#c7d5df':'#dfc68c';
 return `<svg viewBox="0 0 200 245" width="150" height="184" role="img" aria-label="Nhân vật khoa bảng Việt Nam trong trang phục cổ phong cách điệu"><defs><linearGradient id="robe_${kind}" x2="0" y2="1"><stop stop-color="${trim}" stop-opacity=".9"/><stop offset=".18" stop-color="${color}"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
 <ellipse cx="101" cy="229" rx="73" ry="11" fill="#41291b" opacity=".16"/>
 <path d="M49 112Q100 91 151 112L176 221Q100 238 25 221Z" fill="url(#robe_${kind})" stroke="#553728" stroke-width="3"/>
 <path d="M67 117Q100 139 133 117L145 216Q100 228 55 216Z" fill="${color}" stroke="${trim}" stroke-width="2"/>
 <path d="M49 119L23 175Q28 184 43 180L75 144M150 119L179 175Q171 184 158 180L126 144" fill="${color}" stroke="${trim}" stroke-width="3"/>
 <path d="M68 121Q102 152 132 121" fill="none" stroke="${trim}" stroke-width="5"/>
 <circle cx="100" cy="78" r="36" fill="#e5b793" stroke="#8e6249" stroke-width="2"/>
 <path d="M64 75Q68 38 103 42Q134 43 136 71L126 56Q100 65 76 56Z" fill="#252c29"/>
 <path d="M80 80h12M108 80h12" stroke="#3d2a22" stroke-width="3" stroke-linecap="round"/>
 <path d="M98 89l3 6 5-5" stroke="#a56d54" stroke-width="2" fill="none"/>
 <path d="M89 102Q100 109 111 102" stroke="#9f6551" stroke-width="2" fill="none"/>
 <path d="M65 55Q62 30 80 19H119Q138 28 136 54Z" fill="#282c2a" stroke="${trim}" stroke-width="4"/>
 <path d="M60 47H140L154 55Q101 66 46 55Z" fill="#2b312d" stroke="${trim}" stroke-width="3"/>
 <path d="M62 48L39 35L35 43L61 57M138 48l24-13 4 8-27 14" fill="#2b312d" stroke="${trim}" stroke-width="3"/>
 <circle cx="100" cy="33" r="8" fill="${trim}" stroke="#77522c" stroke-width="1"/><path d="M100 28l3 5-3 4-3-4z" fill="#8f3a26"/>
 <path d="M95 148Q100 139 105 148l10 12-15 18-15-18z" fill="${trim}" opacity=".9"/><path d="M97 148h6v54h-6z" fill="${trim}" opacity=".7"/>
 </svg>`
}
