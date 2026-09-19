import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:60000,use:{baseURL:process.env.E2E_BASE_URL||'http://127.0.0.1:5188',browserName:'chromium',channel:'chrome',trace:'retain-on-failure'},reporter:'list'});
