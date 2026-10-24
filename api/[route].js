import { createApiHandler } from '../server/handler.js';

// Vercel discovers root api/ functions alongside the Vite static output. Keep
// this shared handler warm so its bounded, instance-local guards are reused.
export default createApiHandler();
