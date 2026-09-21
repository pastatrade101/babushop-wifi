import {error} from '@sveltejs/kit';
import {CSV_TEMPLATE} from '$lib/csv';
// +server.ts endpoints do NOT run the (staff) layout's load, so the group's
// sign-in guard does not reach here -- check explicitly. The content is only a
// worked example, but a staff path should not answer anonymous callers.
export const GET=async(event:any)=>{
 if(!event.locals.user)error(401,'Staff login required.');
 // A filled-in example rather than bare headers: the duration unit is the thing
 // operators get wrong, so the rows show 60 / 1440 / 10080 minutes explicitly.
 return new Response(CSV_TEMPLATE,{headers:{
  'Content-Type':'text/csv; charset=utf-8',
  'Content-Disposition':'attachment; filename="package-template.csv"',
  'Cache-Control':'no-store'
 }});
};
