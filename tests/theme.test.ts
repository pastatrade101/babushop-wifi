import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const source=readFileSync(new URL('../apps/web/static/theme.js',import.meta.url),'utf8');
function boot(saved:string|null=null,dark=false,blocked=false){
 const listeners:Record<string,()=>void>={};
 const root={dataset:{} as Record<string,string>,style:{colorScheme:''}};
 const meta={content:''};
 const media={matches:dark,addEventListener:(event:string,cb:()=>void)=>listeners['media:'+event]=cb};
 const storage={getItem:()=>{if(blocked)throw new Error('Storage blocked');return saved;},setItem:(_key:string,value:string)=>{saved=value;}};
 runInNewContext(source,{window:{matchMedia:()=>media,addEventListener:(event:string,cb:()=>void)=>listeners[event]=cb},document:{documentElement:root,querySelector:()=>meta,addEventListener:()=>{}},localStorage:storage});
 return {root,meta,media,listeners,setSaved:(value:string|null)=>saved=value};
}
describe('shared web and router theme',()=>{
 it('applies the stored preference before rendering, regardless of OS theme',()=>{const {root,meta}=boot('dark',false);expect(root.dataset.theme).toBe('dark');expect(root.style.colorScheme).toBe('dark');expect(meta.content).toBe('#111827');expect(boot('light',true).root.dataset.theme).toBe('light');});
 it('follows system changes only when there is no explicit override',()=>{const t=boot(null,false);t.media.matches=true;t.listeners['media:change']();expect(t.root.dataset.theme).toBe('dark');t.setSaved('light');t.listeners['media:change']();expect(t.root.dataset.theme).toBe('light');});
 it('synchronizes explicit changes and other tabs',()=>{const t=boot('light');t.setSaved('dark');t.listeners['wifi-theme-change']();expect(t.root.dataset.theme).toBe('dark');t.setSaved('light');t.listeners.storage();expect(t.root.dataset.theme).toBe('light');});
 it('falls back to the system when storage is unavailable or invalid',()=>{expect(boot(null,true,true).root.dataset.theme).toBe('dark');expect(boot('invalid',false).root.dataset.theme).toBe('light');});
});
