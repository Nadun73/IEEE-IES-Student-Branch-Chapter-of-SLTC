import { build } from 'vite';
import react from '@vitejs/plugin-react';

(async () => {
  try {
    console.log('Starting compilation check...');
    await build({
      root: './',
      plugins: [react()],
      logLevel: 'info',
      build: {
        write: false,
      }
    });
    console.log('Compilation check passed successfully!');
  } catch (err) {
    console.error('Compilation check failed:');
    console.error(err);
  }
})();
