import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: '@hey-api/client-fetch',
  input: './backend/openapi.json',
  output: 'src/lib/api',
});
