import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['.babu-backup/**','**/node_modules/**','**/.svelte-kit/**','**/build/**','test-results/**','dist/**']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.ts'],rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}},{files:['**/*.js'],languageOptions:{globals:{process:'readonly'}}});
