import {it,expect} from 'vitest';
import {providerClass,providerText,providerSmall} from '../apps/web/src/lib/providers.ts';
import {AZAM_NETWORKS} from '../packages/payments/src/azam.provider.ts';

it('gives every AzamPay network its own tile, and none of them M-Pesa by accident',()=>{
 const tiles=AZAM_NETWORKS.map(n=>[n.value,providerClass(n.value),providerText(n.value,n.label),providerSmall(n.value)]);
 expect(tiles).toEqual([
  ['vodacom','mpesa','M-PESA',''],
  ['airtel','airtel','airtel','money'],
  ['tigo','mixx','mixx','by Yas'],
  ['halopesa','halo','Halo','Pesa'],
  ['azampesa','azam','Azam','Pesa'],
 ]);
 // Unknown networks fall back to their own label.
 expect(providerText('ttcl','TTCL Pesa')).toBe('TTCL Pesa');
 expect(providerClass('m-pesa')).toBe('mpesa');
});
