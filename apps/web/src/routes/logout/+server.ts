import {redirect} from '@sveltejs/kit';
export const POST=async({locals}:any)=>{await locals.supabase?.auth.signOut();redirect(303,'/login');};
