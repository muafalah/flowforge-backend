import * as path from 'path';
import * as dotenv from 'dotenv';

// Load the integration-specific environment file
dotenv.config({
  path: path.resolve(__dirname, '..', '.env.integration'),
  override: true,
});
