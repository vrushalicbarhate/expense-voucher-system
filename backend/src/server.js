const app = require('./app');
const config = require('./config');

if (config.env === 'production' && config.jwtSecret === 'dev-only-secret') {
  console.error('Refusing to start: set a real JWT_SECRET in production.');
  process.exit(1);
}

app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
