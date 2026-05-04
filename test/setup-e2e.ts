import * as path from 'path';
import * as dotenv from 'dotenv';

// Load the e2e-specific environment file
dotenv.config({
  path: path.resolve(__dirname, '..', '.env.e2e'),
  override: true,
});
