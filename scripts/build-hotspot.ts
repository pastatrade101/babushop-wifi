import 'dotenv/config';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {renderHotspotPages,hotspotBrandFromEnv} from '../packages/network/src/hotspot-pages.ts';

// Writes the shop's branded HotSpot pages to dist/hotspot, for the rare case
// they are uploaded by hand with WinBox (Files). The portal's Router › Files
// window publishes the same set straight to the router. The set includes
// theme.js; the router keeps its own md5.js.
//   pnpm hotspot:build
const brand=hotspotBrandFromEnv(process.env);
const pages=renderHotspotPages(brand);
const dir=resolve('dist/hotspot');await mkdir(dir,{recursive:true});
for(const [name,content] of Object.entries(pages))await writeFile(resolve(dir,name),content);
console.info(`Branded pages written to dist/hotspot (${Object.keys(pages).join(', ')}).`);
console.info(`"Nunua vocha" opens ${brand.buyUrl}; sign-in returns to ${brand.statusUrl}. Upload them together and keep the router's own md5.js.`);
