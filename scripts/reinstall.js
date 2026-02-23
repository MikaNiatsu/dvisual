import { execSync } from 'child_process';

try {
  console.log('Installing dependencies with pnpm...');
  execSync('pnpm install --force', { 
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit' 
  });
  console.log('Dependencies installed successfully!');
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}
