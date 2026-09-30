import {env} from '$env/dynamic/private';
import {brand} from '$lib/server/api';
// Nothing is loaded from the query string on purpose: the provider returns the
// buyer here with whatever it likes in the URL, and none of it is trusted. The
// claim token lives in browser storage and is POSTed from there.
export const load=async()=>({brand:brand(),support:env.WIFI_SUPPORT_CONTACT||'',phone:env.WIFI_SELLER_PHONE||'0758342054',loginUrl:env.HOTSPOT_LOGIN_URL||'http://10.78.0.1/login',logo:'/logo.webp'});
