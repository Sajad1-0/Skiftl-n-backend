import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 SkiftLön API körs på http://localhost:${env.PORT}`);
  console.log(`📍 Miljö: ${env.NODE_ENV}`);
});
