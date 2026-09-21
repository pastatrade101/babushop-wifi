import {it,expect} from 'vitest';
import {packagesFromCsv,parseCsv,CSV_TEMPLATE} from '../apps/web/src/lib/csv.ts';

it('reads the shipped template', () => {
 const rows=packagesFromCsv(CSV_TEMPLATE);
 expect(rows).toHaveLength(3);
 expect(rows[0]).toMatchObject({name:'1 Hour',price_tzs:1000,duration_minutes:60,download_mbps:5,upload_mbps:2,active:true});
 expect(rows[2].duration_minutes).toBe(10080);
});

it('handles quoted commas, doubled quotes, CRLF and a BOM', () => {
 const csv='﻿name,price_tzs,duration_minutes\r\n"Evening, late","1500",90\r\n"He said ""hi""",200,10\r\n';
 const rows=packagesFromCsv(csv);
 expect(rows[0].name).toBe('Evening, late');
 expect(rows[0].price_tzs).toBe(1500);
 expect(rows[1].name).toBe('He said "hi"');
});

it('accepts thousands separators and blank optional columns', () => {
 const rows=packagesFromCsv('name,price_tzs,duration_minutes,download_mbps,upload_mbps,active\nDay,"2,000",1440,,,\n');
 expect(rows[0]).toMatchObject({price_tzs:2000,download_mbps:null,upload_mbps:null,active:true,description:''});
});

it('reads active flags and ignores blank lines', () => {
 const rows=packagesFromCsv('name,price_tzs,duration_minutes,active\nA,100,10,no\n\nB,100,10,TRUE\n\n');
 expect(rows.map(r=>r.active)).toEqual([false,true]);
});

it('rejects a missing required column, an unknown column and bad numbers', () => {
 expect(()=>packagesFromCsv('name,price_tzs\nA,100\n')).toThrow('duration_minutes');
 expect(()=>packagesFromCsv('name,price_tzs,duration_minutes,colour\nA,100,10,red\n')).toThrow('Unrecognised');
 expect(()=>packagesFromCsv('name,price_tzs,duration_minutes\nA,free,10\n')).toThrow('whole number');
 expect(()=>packagesFromCsv('name,price_tzs,duration_minutes\nA,,10\n')).toThrow('empty');
});

it('does not treat a quoted newline as a row break', () => {
 expect(parseCsv('a,"line1\nline2"\n')).toEqual([['a','line1\nline2']]);
});
