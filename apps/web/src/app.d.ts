import type {SupabaseClient,User} from '@supabase/supabase-js';
declare global {namespace App {interface Locals {supabase:SupabaseClient|null;user:User|null;accessToken:string|null;staff:any;}}}
export {};
