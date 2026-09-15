import { pingDatabase } from '../src/db.js';

export default async function handler(_request: any, response: any) {
  try {
    await pingDatabase();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ status: 'ready', service: 'lalapay-api', database: true }));
  } catch {
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ status: 'not_ready', service: 'lalapay-api', database: false }));
  }
}
