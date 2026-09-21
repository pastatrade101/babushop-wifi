import {CSV_TEMPLATE} from '$lib/csv';
// A filled-in example rather than bare headers: the duration unit is the thing
// operators get wrong, so the rows show 60 / 1440 / 10080 minutes explicitly.
export const GET=async()=>new Response(CSV_TEMPLATE,{headers:{
 'Content-Type':'text/csv; charset=utf-8',
 'Content-Disposition':'attachment; filename="package-template.csv"',
 'Cache-Control':'no-store'
}});
