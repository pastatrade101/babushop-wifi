import {expect,it} from 'vitest';
import {safeRequestPath} from '../apps/api/src/logging.ts';
it('redacts callback path secrets and query strings',()=>{
 expect(safeRequestPath('/api/v1/portal/payments/webhook/azam/secret?key=private')).toBe('/api/v1/portal/payments/webhook/azam/[REDACTED]');
 expect(safeRequestPath('/api/v1/packages?q=private')).toBe('/api/v1/packages');
 expect(safeRequestPath('/health/ready')).toBe('/health/ready');
});
