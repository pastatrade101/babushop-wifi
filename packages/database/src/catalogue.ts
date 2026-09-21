import {tx,audit,requireValue,Problem,SITE,type Staff} from './index.ts';
import {validateSpeeds} from '../../network/src/index.ts';

export interface PackageRow {
 name:string;description?:string;price_tzs:number;duration_minutes:number;
 download_mbps?:number|null;upload_mbps?:number|null;active?:boolean;
}

/**
 * Create many packages at once.
 *
 * All-or-nothing on purpose: a partially imported catalogue is worse than a
 * rejected one, because the operator cannot tell which rows landed without
 * reading every package. Every row is validated first and the whole import is
 * refused with a per-row report if any fails.
 *
 * Existing packages are never modified, and existing voucher terms are
 * untouched -- vouchers copy their terms at generation and freeze them.
 */
export async function bulkCreate(staff:Staff,items:PackageRow[]){
 requireValue(items.length>0,400,'The file contained no package rows.');
 requireValue(items.length<=200,400,'Import at most 200 packages at a time.');
 const problems:string[]=[];
 const seen=new Map<string,number>();
 items.forEach((row,index)=>{
  const line=index+1,name=(row.name||'').trim();
  if(name.length<1||name.length>100)problems.push(`Row ${line}: name must be 1-100 characters.`);
  if(!Number.isInteger(row.price_tzs)||row.price_tzs<1||row.price_tzs>10000000)problems.push(`Row ${line}: price must be a whole number of TZS, at least 1.`);
  if(!Number.isInteger(row.duration_minutes)||row.duration_minutes<1||row.duration_minutes>525600)problems.push(`Row ${line}: duration must be between 1 and 525600 minutes.`);
  if((row.description||'').length>1000)problems.push(`Row ${line}: description is longer than 1000 characters.`);
  // The same guard the single-package form uses: paired speeds, within fibre capacity.
  try{validateSpeeds({download_mbps:row.download_mbps??null,upload_mbps:row.upload_mbps??null});}
  catch(error){problems.push(`Row ${line}: ${(error as Error).message}`);}
  const key=name.toLowerCase();
  if(key){const first=seen.get(key);if(first)problems.push(`Row ${line}: duplicates the name on row ${first}.`);else seen.set(key,line);}
 });
 requireValue(problems.length===0,400,problems.slice(0,10).join(' ')+(problems.length>10?` (+${problems.length-10} more)`:''));
 return tx(async db=>{
  // Reject names already in the catalogue rather than silently creating a
  // second package the cashier cannot tell apart.
  const names=[...seen.keys()];
  const clashes=(await db.query('select name from wifi.packages where site_id=$1 and lower(name)=any($2::text[])',[SITE,names])).rows.map(r=>r.name);
  if(clashes.length)throw new Problem(409,'These package names already exist: '+clashes.join(', ')+'. Rename them in the file or delete the existing ones first.');
  const created=[];
  for(const row of items){
   const speeds=validateSpeeds({download_mbps:row.download_mbps??null,upload_mbps:row.upload_mbps??null});
   created.push((await db.query(
    'insert into wifi.packages(site_id,name,description,price_tzs,duration_minutes,active,download_mbps,upload_mbps) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',
    [SITE,row.name.trim(),(row.description||'').trim(),row.price_tzs,row.duration_minutes,row.active??true,speeds.download_mbps,speeds.upload_mbps])).rows[0]);
  }
  await audit(db,staff.id,'PACKAGES_IMPORTED',null,{count:created.length,names:created.map(p=>p.name)});
  return {created:created.length,items:created};
 });
}
