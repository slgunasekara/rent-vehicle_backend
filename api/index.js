// Vercel needs a file in api/. All the logic is TypeScript: src/vercel.ts (compiled to dist/vercel.js by `npm run build`).
module.exports = require('../dist/vercel').default;
