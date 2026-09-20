import dgram from 'node:dgram';
import {isIPv4} from 'node:net';
import {pool} from '../packages/database/src/index.ts';
import {key} from '../packages/database/src/crypto.ts';
import {authorizeRadius} from '../packages/database/src/radius-access.ts';
import {radiusConfig, makeRadiusHandler} from '../packages/network/src/radius.ts';
import {makeAccountingHandler} from '../packages/network/src/accounting.ts';
import {recordAccounting} from '../packages/database/src/record-accounting.ts';

const config = radiusConfig();
key('VOUCHER_LOOKUP_KEY'); key('VOUCHER_ENCRYPTION_KEY');
const bind = process.env.MIKROTIK_RADIUS_BIND || '10.77.0.1';
if (!isIPv4(bind) || bind === '0.0.0.0') throw new Error('Bind RADIUS to the explicit private WireGuard IPv4 address');
// Fail startup if migration or database access is missing.
await pool.query('select provider from wifi.access_grants limit 0');
const handle = makeRadiusHandler(config, request => authorizeRadius(request, config));
const accounting = makeAccountingHandler(config, event => recordAccounting(event, config.clientIp));
const sockets = [handle, accounting].map((handler, i) => {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (message, peer) => {
    void handler(message, peer.address).then(reply => {
      if (reply) socket.send(reply, peer.port, peer.address, error => { if (error) console.error('RADIUS reply could not be sent'); });
    }).catch(() => console.error('RADIUS request failed closed'));
  });
  socket.on('error', () => { console.error('RADIUS socket failed'); process.exit(1); });
  socket.bind(1812 + i, bind, () => console.info(`MikroTik RADIUS listening on private UDP ${1812 + i}`));
  return socket;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  for (const socket of sockets) socket.close();
  void pool.end().then(() => process.exit(0));
});
