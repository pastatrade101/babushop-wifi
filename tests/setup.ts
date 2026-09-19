import {randomBytes} from 'node:crypto';
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||'postgresql://postgres@127.0.0.1:55432/babu_wifi_test';
process.env.VOUCHER_LOOKUP_KEY=randomBytes(32).toString('hex');process.env.VOUCHER_ENCRYPTION_KEY=randomBytes(32).toString('hex');process.env.PORTAL_CONTEXT_SECRET=randomBytes(32).toString('hex');
process.env.OMADA_MODE='mock';process.env.PORTAL_SITE='babu-shop';process.env.PORTAL_SSID='BABU-SHOP WIFI';process.env.PORTAL_AP_MACS='AA:BB:CC:DD:EE:01';process.env.APP_ORIGIN='http://127.0.0.1:5188';process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_PUBLISHABLE_KEY='test-not-a-secret';
