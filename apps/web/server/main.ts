import { createAppServer } from './app.ts';

const port = Number(process.env.PORT ?? 5174);
const host = process.env.HOST ?? '127.0.0.1';
createAppServer().listen(port, host, () => {
  console.log(`OptiPine: http://${host}:${port}`);
});
