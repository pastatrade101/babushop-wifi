import {it,expect} from 'vitest';
import {normalizeMac,vipComment,vipIdOf,reconcile,MikroTikBindingWriter,VIP_TAG,type RouterBinding} from '../packages/network/src/bindings.ts';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';

it('reads a Wi-Fi address however it is typed, and refuses what is not one device',()=>{
 for(const v of ['6E:7E:F2:CA:66:74','6e-7e-f2-ca-66-74','6e7e.f2ca.6674','6E7EF2CA6674',' 6e:7e:f2:ca:66:74 '])expect(normalizeMac(v),v).toBe('6E:7E:F2:CA:66:74');
 for(const bad of ['','6E:7E:F2:CA:66','6E:7E:F2:CA:66:74:00','00:00:00:00:00:00','FF:FF:FF:FF:FF:FF','01:00:5E:00:00:01','zz:zz'])expect(()=>normalizeMac(bad),bad).toThrow();
});

it('tags each binding with the portal id, and reads the tag back, ignoring hand-made bindings',()=>{
 expect(vipComment(A,'Owner phone "main"')).toBe(`${VIP_TAG}${A} Owner phone main`);
 expect(vipIdOf(vipComment(A,'x'))).toBe(A);
 expect(vipIdOf('printer by hand')).toBeNull();
 expect(vipIdOf(undefined)).toBeNull();
});

it('plans only the changes needed, and never touches bindings it did not make',()=>{
 const bindings:RouterBinding[]=[
  {'.id':'*1','mac-address':'6E:7E:F2:CA:66:74',type:'bypassed',comment:vipComment(A,'Owner'),disabled:'false'},    // healthy: kept
  {'.id':'*2','mac-address':'AA:AA:AA:AA:AA:AA',type:'bypassed',comment:vipComment(B,'Old')},                     // B switched off: removed
  {'.id':'*3','mac-address':'BB:BB:BB:BB:BB:BB',type:'bypassed',comment:'printer'},                               // hand-made: untouched
  {'.id':'*4','mac-address':'6E:7E:F2:CA:66:74',type:'bypassed',comment:vipComment(A,'Owner duplicate')},           // a second copy of A: removed
 ];
 const plan=reconcile([{id:A,mac:'6E:7E:F2:CA:66:74',name:'Owner'}],bindings);
 expect(plan.kept).toEqual([{id:A,bindingId:'*1'}]);
 expect(plan.remove.map(b=>b['.id']).sort()).toEqual(['*2','*4']);
 expect(plan.add).toEqual([]);
 // A binding with the wrong address, type or disabled is replaced.
 for(const broken of [{'mac-address':'CC:CC:CC:CC:CC:CC'},{type:'regular'},{disabled:'true'}]){
  const p=reconcile([{id:A,mac:'6E:7E:F2:CA:66:74',name:'Owner'}],[{...bindings[0],...broken}]);
  expect(p.remove.map(b=>b['.id'])).toEqual(['*1']);expect(p.add.map(v=>v.id)).toEqual([A]);
 }
 // Missing on the router: added.
 expect(reconcile([{id:B,mac:'AA:AA:AA:AA:AA:AA',name:'New'}],[]).add.map(v=>v.id)).toEqual([B]);
});

it('adds a bypass binding on the shop hotspot, and removes only its own',async()=>{
 const w=new MikroTikBindingWriter({baseUrl:'https://router.test/',username:'portal-files',password:'x',server:'babu-hotspot'});
 const sent:any[]=[];
 (w as any).request=async(method:string,path:string,body?:any)=>{sent.push({method,path,body});return method==='PUT'?{'.id':'*9'}:null;};
 expect(await w.add({id:A,mac:'6e-7e-f2-ca-66-74',name:'Owner phone'})).toBe('*9');
 expect(sent[0]).toEqual({method:'PUT',path:'ip/hotspot/ip-binding',body:{'mac-address':'6E:7E:F2:CA:66:74',type:'bypassed',server:'babu-hotspot',comment:`${VIP_TAG}${A} Owner phone`}});
 await w.remove({'.id':'*9',comment:vipComment(A,'Owner phone')});
 expect(sent[1]).toEqual({method:'DELETE',path:'ip/hotspot/ip-binding/*9',body:undefined});
 await expect(w.remove({'.id':'*3',comment:'printer'})).rejects.toThrow(/did not make/);
 await expect(w.remove({'.id':'*3; /system reset',comment:vipComment(A,'x')})).rejects.toThrow(/Unexpected/);
 // A binding that is already gone counts as removed.
 (w as any).request=async()=>{throw Object.assign(new Error('no such item'),{status:404});};
 await expect(w.remove({'.id':'*9',comment:vipComment(A,'x')})).resolves.toBeUndefined();
 w.close();
});
