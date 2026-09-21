// Minimal RFC 4180 reader, matching the csvCell writer used for exports:
// quoted fields may contain commas, newlines and doubled quotes.
export function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,i=0;
 const source=text.replace(/^\uFEFF/,'');   // Excel writes a BOM.
 const pushField=()=>{row.push(field);field='';};
 const pushRow=()=>{pushField();if(row.some(c=>c.trim()!==''))rows.push(row);row=[];};
 while(i<source.length){
  const ch=source[i];
  if(quoted){
   if(ch==='"'){if(source[i+1]==='"'){field+='"';i+=2;continue;}quoted=false;i++;continue;}
   field+=ch;i++;continue;
  }
  if(ch==='"'){quoted=true;i++;continue;}
  if(ch===','){pushField();i++;continue;}
  if(ch==='\r'){i++;continue;}
  if(ch==='\n'){pushRow();i++;continue;}
  field+=ch;i++;
 }
 if(field!==''||row.length)pushRow();
 return rows;
}

const HEADERS=['name','description','price_tzs','duration_minutes','download_mbps','upload_mbps','active'] as const;
export const CSV_TEMPLATE='name,description,price_tzs,duration_minutes,download_mbps,upload_mbps,active\r\n'+
 '"1 Hour","Quick browsing",1000,60,5,2,yes\r\n'+
 '"1 Day","All day access",2000,1440,10,5,yes\r\n'+
 '"1 Week","Best value",8000,10080,10,5,yes\r\n';

export interface ParsedPackage {name:string;description:string;price_tzs:number;duration_minutes:number;download_mbps:number|null;upload_mbps:number|null;active:boolean}

/**
 * Turn an uploaded CSV into package rows. Rejects the whole file on a
 * structural problem: a half-understood catalogue is worse than none, and the
 * operator gets a specific reason rather than a silent partial import.
 */
export function packagesFromCsv(text:string):ParsedPackage[]{
 const rows=parseCsv(text);
 if(!rows.length)throw new Error('That file has no rows.');
 const header=rows[0].map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
 for(const required of ['name','price_tzs','duration_minutes'])
  if(!header.includes(required))throw new Error(`The header row must include "${required}". Expected: ${HEADERS.join(', ')}.`);
 const unknown=header.filter(h=>h&&!HEADERS.includes(h as typeof HEADERS[number]));
 if(unknown.length)throw new Error(`Unrecognised column${unknown.length>1?'s':''}: ${unknown.join(', ')}. Expected: ${HEADERS.join(', ')}.`);
 const at=(row:string[],key:string)=>{const index=header.indexOf(key);return index<0?'':(row[index]??'').trim();};
 const number=(raw:string,label:string,line:number)=>{
  // Tolerate thousands separators and stray spaces from spreadsheets.
  const cleaned=raw.replace(/[\s,]/g,'');
  if(cleaned==='')throw new Error(`Row ${line}: ${label} is empty.`);
  if(!/^\d+$/.test(cleaned))throw new Error(`Row ${line}: ${label} must be a whole number, not "${raw}".`);
  return Number(cleaned);
 };
 return rows.slice(1).map((row,index)=>{
  const line=index+1,blank=(v:string)=>v==='';
  const down=at(row,'download_mbps'),up=at(row,'upload_mbps'),activeRaw=at(row,'active').toLowerCase();
  return {
   name:at(row,'name'),
   description:at(row,'description'),
   price_tzs:number(at(row,'price_tzs'),'price_tzs',line),
   duration_minutes:number(at(row,'duration_minutes'),'duration_minutes',line),
   download_mbps:blank(down)?null:number(down,'download_mbps',line),
   upload_mbps:blank(up)?null:number(up,'upload_mbps',line),
   // Blank means active: an operator uploading a catalogue means to sell it.
   active:blank(activeRaw)?true:['yes','y','true','1','active'].includes(activeRaw)
  };
 });
}
