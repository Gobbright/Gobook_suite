const LOCAL_NETWORK_ORIGIN = /^http:\/\/((localhost|127\.0\.0\.1)|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/;

export function createCorsOriginValidator({ nodeEnv, origins }) {
  const allowed = new Set(origins);
  return (origin, callback) => {
    if (!origin || allowed.has(origin) || nodeEnv !== 'production' && LOCAL_NETWORK_ORIGIN.test(origin)) {
      callback(null, true);
      return;
    }
    callback(Object.assign(new Error('Origin is not allowed by CORS'), { statusCode: 403, code: 'CORS_ORIGIN_DENIED' }));
  };
}
