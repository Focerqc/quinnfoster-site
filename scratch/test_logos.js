const fs = require('fs');

// Test generating SVG previews for Shred n Vibe and DynaVap

const shredNVibeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 260" width="500" height="260">
  <rect width="500" height="260" fill="#000000"/>
  <g transform="translate(250, 130) skewX(-14)" text-anchor="middle" font-family="'Arial Black', 'Impact', 'Trebuchet MS', sans-serif" font-weight="900">
    <text x="0" y="-28" font-size="76" fill="#ffffff" letter-spacing="4">SHRED</text>
    <text x="0" y="24" font-size="44" fill="#ffffff" letter-spacing="2">N</text>
    <text x="0" y="86" font-size="76" fill="#ffffff" letter-spacing="5">VIBE</text>
  </g>
</svg>`;

const dynavapSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 220" width="540" height="220">
  <rect width="540" height="220" fill="#000000"/>
  <!-- Stepped Badge Outer Contour -->
  <path d="M 50 30 
           L 240 30 
           C 255 30 265 42 272 52 
           L 490 52 
           C 505 52 515 62 515 77 
           L 515 143 
           C 515 158 505 168 490 168 
           L 272 168 
           C 265 178 255 190 240 190 
           L 50 190 
           C 35 190 25 180 25 165 
           L 25 55 
           C 25 40 35 30 50 30 Z" 
        fill="none" stroke="#ffffff" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>

  <!-- Vertical Divider Bar -->
  <rect x="75" y="52" width="12" height="116" rx="6" fill="#ffffff"/>

  <!-- Stylized Geometric DYNAVAP Lettering -->
  <g fill="#ffffff" fill-rule="evenodd">
    <!-- D -->
    <path d="M 112 68 H 138 L 154 84 V 136 L 138 152 H 112 Z M 126 82 H 134 L 141 89 V 131 L 134 138 H 126 Z"/>
    
    <!-- Y -->
    <path d="M 162 68 H 176 L 187 96 L 198 68 H 212 L 194 110 V 152 H 180 V 110 Z"/>

    <!-- N -->
    <path d="M 220 68 H 234 L 255 120 V 68 H 269 V 152 H 255 L 234 100 V 152 H 220 Z"/>

    <!-- A1 -->
    <path d="M 292 68 L 314 152 H 299 L 294 132 H 280 L 275 152 H 261 L 283 68 Z M 287 96 L 282 118 H 292 Z"/>

    <!-- V -->
    <path d="M 318 68 H 332 L 345 132 L 358 68 H 372 L 353 152 H 337 Z"/>

    <!-- A2 -->
    <path d="M 391 68 L 413 152 H 398 L 393 132 H 379 L 374 152 H 360 L 382 68 Z M 386 96 L 381 118 H 391 Z"/>

    <!-- P -->
    <path d="M 419 68 H 446 L 460 82 V 114 L 446 128 H 433 V 152 H 419 Z M 433 82 H 442 L 447 87 V 109 L 442 114 H 433 Z"/>
  </g>
</svg>`;

console.log("SVG 1 length:", shredNVibeSvg.length);
console.log("SVG 2 length:", dynavapSvg.length);
