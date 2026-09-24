import {it,expect} from 'vitest';
import {MENUS,NAV,TERMINAL,menuById,menuTree,clean,flags,readMenu,overview,maskVouchers,HIDDEN,SCRIPT_HIDDEN} from '../packages/network/src/console.ts';
import type {ReadPath} from '../packages/network/src/index.ts';

const fake=(answers:Partial<Record<ReadPath,unknown>>)=>{
 const asked:ReadPath[]=[];
 return {asked,read:async(path:ReadPath)=>{asked.push(path);if(!(path in answers))throw new Error('Router rejected request');return answers[path];}};
};

it('offers a fixed menu list and never hands the browser a router path',()=>{
 expect(new Set(MENUS.map(m=>m.id)).size).toBe(MENUS.length);
 expect(new Set(MENUS.map(m=>m.path)).size).toBe(MENUS.length);
 for(const m of MENUS)expect(m.id).toMatch(/^[a-z0-9-]{1,40}$/);
 const windows=menuTree().flatMap(e=>e.window?[e.window]:e.windows!);
 for(const tab of windows.flatMap(w=>w.tabs))expect(Object.keys(tab).sort()).toEqual(['id','label','live','single']);
 expect(JSON.stringify(menuTree())).not.toContain('"path"');
 // WinBox's menu covers every list exactly once, plus the terminal.
 const tabs=NAV.flatMap(e=>e.window?[e.window]:e.windows!).flatMap(w=>w.tabs);
 expect(tabs.filter(t=>t!==TERMINAL).sort()).toEqual(MENUS.map(m=>m.id).sort());
 expect(new Set(windows.map(w=>w.id)).size).toBe(windows.length);
 expect(menuById('hotspot-active')?.path).toBe('ip/hotspot/active');
 for(const bad of ['../system/reset-configuration','system/reboot','ip/hotspot/active/remove','','Log'])expect(menuById(bad)).toBeNull();
});

it('reads exactly the path behind the menu it was asked for',async()=>{
 const router=fake({'ip/arp':[]});
 await readMenu(router,menuById('arp')!);
 expect(router.asked).toEqual(['ip/arp']);
});

it('hides every secret and script body, and nothing else',()=>{
 const [row]=clean({name:'wg-babu','private-key':'cHJpdmF0ZQ==','public-key':'cHVibGlj',password:'hunter2',secret:'radius-shared','shared-secret':'s','preshared-key':'psk',
  key:'k','wpa2-pre-shared-key':'wifi-pass','security.passphrase':'wifi-pass','on-event':'/tool fetch user=admin password=x','source':':put 1',
  'up-script':'x','empty-password-kept-empty':'',address:'10.78.0.1/24','mac-address':'D4:D6:DF:A5:F6:6C'});
 expect(row).toMatchObject({'private-key':HIDDEN,password:HIDDEN,secret:HIDDEN,'shared-secret':HIDDEN,'preshared-key':HIDDEN,key:HIDDEN,
  'wpa2-pre-shared-key':HIDDEN,'security.passphrase':HIDDEN,'on-event':SCRIPT_HIDDEN,source:SCRIPT_HIDDEN,'up-script':SCRIPT_HIDDEN,
  'public-key':'cHVibGlj',address:'10.78.0.1/24','mac-address':'D4:D6:DF:A5:F6:6C',name:'wg-babu'});
 expect(JSON.stringify(row)).not.toMatch(/hunter2|radius-shared|wifi-pass|cHJpdmF0ZQ|admin password/);
 // An unset secret stays visibly unset rather than looking configured.
 expect(clean({password:''})[0].password).toBe('');
});

it('shows a customer voucher the way the Vouchers page does, wherever it appears',()=>{
 expect(maskVouchers('ABCDEFGHJKLMNPQR')).toBe('••••-••••-••••-NPQR');
 expect(maskVouchers('ABCD-EFGH-JKLM-NPQR')).toBe('••••-••••-••••-NPQR');
 expect(maskVouchers('->: ABCDEFGHJKLMNPQR (10.78.0.55): logged in')).toBe('->: ••••-••••-••••-NPQR (10.78.0.55): logged in');
 // Not vouchers: MACs, interface names, lower case, and 15 or 17 characters.
 for(const v of ['D4:D6:DF:A5:F6:6C','babu-guest','abcdefghjklmnpqr','ABCDEFGHJKLMNPQ','ABCDEFGHJKLMNPQRS','HCT08ABCDEFG'])expect(maskVouchers(v)).toBe(v);
 const [active]=clean([{user:'ABCDEFGHJKLMNPQR',address:'10.78.0.55','mac-address':'AA:BB:CC:DD:EE:FF'}]);
 expect(active.user).toBe('••••-••••-••••-NPQR');
});

it('marks rows with WinBox flags and keeps only the columns this router returned',async()=>{
 expect(flags({disabled:'true',dynamic:'false',running:'false'})).toBe('X');
 expect(flags({running:'true',dynamic:'true',slave:'true'})).toBe('DRS');
 const router=fake({interface:[{'.id':'*1',name:'ether1',type:'ether',running:'true','rx-byte':'10','tx-byte':'20'},{'.id':'*2',name:'ether2',type:'ether',disabled:'true'}]});
 const out=await readMenu(router,menuById('interfaces')!);
 expect(out.columns).toEqual(['name','type','tx-byte','rx-byte']);
 expect(out.items.map(r=>r['.flags'])).toEqual(['R','X']);
 // A menu whose expected columns are all absent still shows something.
 const odd=await readMenu(fake({'ip/pool':[{'.id':'*1',foo:'1',bar:'2'}]}),menuById('pools')!);
 expect(odd.columns).toEqual(['foo','bar']);
});

it('shows the newest 500 log lines first',async()=>{
 const lines=Array.from({length:800},(_,i)=>({'.id':'*'+i,time:String(i),topics:'system,info',message:'line '+i}));
 const out=await readMenu(fake({log:lines}),menuById('log')!);
 expect(out.count).toBe(500);
 expect(out.truncated).toBe(true);
 expect(out.items[0].message).toBe('line 799');
 expect(out.items[499].message).toBe('line 300');
});

it('treats single-value menus as one record',async()=>{
 const out=await readMenu(fake({'ip/dns':{servers:'8.8.8.8','allow-remote-requests':'true'}}),menuById('dns')!);
 expect(out.columns).toEqual([]);
 expect(out.items).toEqual([{servers:'8.8.8.8','allow-remote-requests':'true'}]);
});

it('summarises the router, and says so when it is not answering',async()=>{
 const router=fake({'system/resource':{version:'7.16.2 (stable)','board-name':'hAP ac2',uptime:'4d3h','cpu-load':'7','free-memory':'100','total-memory':'400'},'system/identity':{name:'JIACHIE'},'system/clock':{time:'12:00:00',date:'2026-09-24'}});
 expect(await overview(router)).toMatchObject({identity:'JIACHIE',version:'7.16.2 (stable)',board:'hAP ac2',cpu_load:'7',model:null,time:'12:00:00'});
 await expect(overview(fake({}))).rejects.toThrow('Router did not answer');
});

// ── Terminal ─────────────────────────────────────────────────────────────────
import {parseCommand,formatPrint,formatPing,helpText} from '../packages/network/src/console.ts';

it('understands print in every spelling RouterOS accepts, and only allowlisted menus',()=>{
 for(const line of ['/ip hotspot active print','/ip/hotspot/active/print','ip hotspot active print','/IP Hotspot Active Print'])
  expect(parseCommand(line)).toMatchObject({kind:'print',menu:{id:'hotspot-active'},detail:false,countOnly:false});
 expect(parseCommand('/interface print detail')).toMatchObject({kind:'print',detail:true});
 expect(parseCommand('/ip dhcp-server lease print count-only')).toMatchObject({kind:'print',countOnly:true,menu:{id:'dhcp-leases'}});
 expect(parseCommand('/ip address print where interface=babu-guest')).toMatchObject({kind:'print',where:[['interface','babu-guest']]});
 expect(parseCommand('/file print')).toMatchObject({kind:'print',menu:{id:'files'}});
 expect(parseCommand('help').kind).toBe('help');
 expect(parseCommand('').kind).toBe('help');
});

it('refuses anything that is not a print, a ping or help -- however it is dressed up',()=>{
 for(const line of ['/system reboot','/system reset-configuration','/ip hotspot active remove 0','/interface disable ether1',
  '/ip address print; /system reboot','/ip address print where address=1 ; /system reboot','/system/reboot print',':put [/system reboot]',
  '/export','/export show-sensitive','/user print; /user add name=x group=full','/tool fetch url=http://x print','/interface print detail from=[/system reboot]',
  'ping google.com','ping 8.8.8.8; /system reboot','ping 999.1.1.1','ping 8.8.8.8 count=500'])
  expect(parseCommand(line).kind,line).toBe('error');
 expect(parseCommand('ping 8.8.8.8 count=3')).toEqual({kind:'ping',address:'8.8.8.8',count:3});
 expect(parseCommand('/tool ping address=1.1.1.1')).toEqual({kind:'ping',address:'1.1.1.1',count:4});
});

it('prints a RouterOS-shaped table, detail and record',()=>{
 const parsed=parseCommand('/interface print') as any;
 const rows=[{'.id':'*1','.flags':'R',name:'ether1',type:'ether'},{'.id':'*2','.flags':'X',name:'ether2',type:'ether'}];
 const table=formatPrint({columns:['name','type'],items:rows},parsed);
 expect(table.split('\n')).toEqual(['Flags: X - DISABLED; R - RUNNING','#    NAME    TYPE','0  R ether1  ether','1  X ether2  ether']);
 expect(formatPrint({columns:['name','type'],items:rows},{...parsed,where:[['name','ether2']]})).toContain('ether2');
 expect(formatPrint({columns:['name','type'],items:rows},{...parsed,where:[['name','ether2']]})).not.toContain('ether1');
 expect(formatPrint({columns:['name','type'],items:rows},{...parsed,countOnly:true})).toBe('2');
 expect(formatPrint({columns:['name','type'],items:rows},{...parsed,detail:true})).toContain('0  R  name=ether1 type=ether');
 const record=formatPrint({columns:[],items:[{uptime:'1d',version:'7.18.2 (stable)'}]},parseCommand('/system resource print') as any);
 expect(record).toBe('   uptime: 1d\n  version: 7.18.2 (stable)');
 expect(formatPing([{host:'8.8.8.8',size:'56',ttl:'117',time:'21ms',status:undefined,sent:'1',received:'1','packet-loss':'0'}])).toContain('sent=1 received=1 packet-loss=0%');
 expect(helpText()).toContain('/ip hotspot active');
});
