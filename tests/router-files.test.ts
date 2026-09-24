import {it,expect} from 'vitest';
import {hotspotPath,checkContents,replaceFile,FileWriteError,type FileStore,type RouterFile} from '../packages/network/src/files.ts';

it('puts files only inside the hotspot folder, and only text ones',()=>{
 expect(hotspotPath('hotspot','login.html')).toBe('hotspot/login.html');
 expect(hotspotPath('hotspot','/login.html')).toBe('hotspot/login.html');
 expect(hotspotPath('hotspot','css/style.css')).toBe('hotspot/css/style.css');
 expect(hotspotPath('flash/hotspot','status.html')).toBe('flash/hotspot/status.html');
 for(const bad of ['../login.html','..','css/../login.html','a/b/c.html','login','run.rsc','backup.backup','setup.npk','x.exe','.html','login.html/','x..html','login .html','login.html;rm','','  '])
  expect(()=>hotspotPath('hotspot',bad),bad).toThrow();
 for(const dir of ['','/','../hotspot','hot spot','hotspot/..'])expect(()=>hotspotPath(dir,'login.html'),dir).toThrow();
});

it('accepts UTF-8 text up to 60 KB and nothing else',()=>{
 expect(checkContents('<html>Karibu JIACHIE</html>')).toBe(27);
 expect(checkContents('x'.repeat(60000))).toBe(60000);
 expect(()=>checkContents('')).toThrow('empty');
 expect(()=>checkContents('x'.repeat(60001))).toThrow('60 KB');
 expect(()=>checkContents('PK\u0003\u0004\u0000')).toThrow('UTF-8');
 expect(()=>checkContents('bad � bytes')).toThrow('UTF-8');
});

/** A router's file table in memory, with switches for the failures that matter. */
function router(files:Record<string,string>,opts:{unreadable?:boolean;mangle?:boolean;failRollback?:boolean}={}){
 const log:string[]=[];let writes=0;
 const store:FileStore={
  async find(name){return name in files?{id:'*'+Object.keys(files).indexOf(name).toString(16).toUpperCase(),name,size:files[name].length} as RouterFile:null;},
  async contents(file){log.push('read '+file.name);return opts.unreadable?null:files[file.name];},
  async write(name,contents){
   writes++;log.push('write '+name);
   if(opts.failRollback&&writes>1)throw new Error('refused');
   files[name]=opts.mangle&&writes===1?contents.slice(0,4095):contents;
  },
 };
 return {store,files,log};
}

it('keeps the current file before replacing it',async()=>{
 const r=router({'hotspot/login.html':'old page'});
 const kept:string[]=[];
 const out=await replaceFile(r.store,'hotspot/login.html','new page',async p=>{kept.push(p);r.log.push('kept');});
 expect(out).toEqual({replaced:true,previous:'old page'});
 expect(kept).toEqual(['old page']);
 expect(r.files['hotspot/login.html']).toBe('new page');
 // The copy is taken before anything is written.
 expect(r.log.indexOf('kept')).toBeLessThan(r.log.indexOf('write hotspot/login.html'));
});

it('creates a new file with nothing to keep',async()=>{
 const r=router({});
 const kept:string[]=[];
 expect(await replaceFile(r.store,'hotspot/new.html','hello',async p=>kept.push(p))).toEqual({replaced:false,previous:null});
 expect(kept).toEqual([]);
 expect(r.files['hotspot/new.html']).toBe('hello');
});

it('will not overwrite a file it cannot copy first',async()=>{
 const r=router({'hotspot/login.html':'old page'},{unreadable:true});
 const error=await replaceFile(r.store,'hotspot/login.html','new page',async()=>{}).catch(e=>e);
 expect(error).toBeInstanceOf(FileWriteError);
 expect(error.status).toBe(409);
 expect(r.files['hotspot/login.html']).toBe('old page');
 expect(r.log.some(l=>l.startsWith('write'))).toBe(false);
});

it('puts the old page back when the router stores something else',async()=>{
 const big='<html>'+'x'.repeat(8000)+'</html>';
 const r=router({'hotspot/login.html':'old page'},{mangle:true});
 const error=await replaceFile(r.store,'hotspot/login.html',big,async()=>{}).catch(e=>e);
 expect(error).toMatchObject({status:502,restored:true});
 expect(error.message).toContain('previous version was put back');
 expect(r.files['hotspot/login.html']).toBe('old page');
});

it('says so plainly when even the rollback fails',async()=>{
 const r=router({'hotspot/login.html':'old page'},{mangle:true,failRollback:true});
 const error=await replaceFile(r.store,'hotspot/login.html','<html>'+'y'.repeat(5000),async()=>{}).catch(e=>e);
 expect(error).toMatchObject({status:502,restored:false});
 expect(error.message).toContain('Restore it from History');
});

it('does not call a line-ending difference a failed upload',async()=>{
 const r=router({});
 r.store.contents=async()=>'line one\nline two\n';
 await expect(replaceFile(r.store,'hotspot/a.txt','line one\r\nline two',async()=>{})).resolves.toMatchObject({replaced:false});
});
