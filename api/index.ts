import { app } from '../dist/server.js';
import { pingDatabase } from '../dist/db.js';

export default async function handler(request: any, response: any) {
  try {
    const path = String(request.url ?? '').split('?')[0];

    if (path === '/health/ready') {
      try {
        await pingDatabase();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ status: 'ready', service: 'lalapay-api' }));
      } catch (error) {
        console.error('LalaPay readiness check failed:', error);
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ status: 'not_ready', service: 'lalapay-api', database: false }));
      }
      return;
    }

    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    console.error('LalaPay Vercel handler failed:', error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ success: false, message: 'Internal server error' }));
    }
  }
}
