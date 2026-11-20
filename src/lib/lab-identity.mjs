/* Lab = shape + colour, in a fixed slot. A lab keeps its slot forever; new labs append.
   Shared by the charts and by the pages that mark models the same way. */
const LAB_SLOTS = ['Anthropic','OpenAI','xAI','Cursor','Google','Meta','DeepSeek','Mistral','Alibaba','Moonshot','Zhipu','Amazon','NVIDIA','Tencent','Microsoft','Reka','MiniMax'];
const HUES = ['#e36b40','#337aef','#bb4cb5','#0bad87','#b88410','#8a7cf0','#e0567a','#4fa83d'];
const SHAPES = ['sun','circle','cross','square','triangle','diamond','star','hexagon','triangleDown','plus','ring','squareO','diamondO','triangleO','hexagonO','starO','plusO'];
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const IDS = new Map();
export function labIdentity(lab){
  if (IDS.has(lab)) return IDS.get(lab);
  let i = LAB_SLOTS.indexOf(lab);
  if (i < 0){ LAB_SLOTS.push(lab); i = LAB_SLOTS.length - 1; }
  const s = i % SHAPES.length;
  const L = { name: lab, slug: slug(lab), slot: i, color: HUES[(s + (s >= 8 ? 3 : 0)) % 8], shape: SHAPES[s] };
  IDS.set(lab, L); return L;
}
