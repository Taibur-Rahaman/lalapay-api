import { app } from '../src/server.js';

export default async function handler(request: any, response: any) {
  try {
    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    console.error('LalaPay Vercel handler failed:', error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: false, message: 'Internal server error' }));
    }
  }
}
