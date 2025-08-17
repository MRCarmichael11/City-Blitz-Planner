module.exports = {
  apps: [
    {
      name: 'vite-preview',
      script: 'node',
      args: './node_modules/vite/bin/vite.js preview --port 8080 --host',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};