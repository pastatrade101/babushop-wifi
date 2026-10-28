/** Callback URL tokens authenticate payment events; never persist them in logs. */
export function safeRequestPath(url:string):string{
 return url.split('?')[0].replace(/(\/api\/v1\/portal\/payments\/webhook\/azam\/)[^/?#]+/,'$1[REDACTED]');
}
