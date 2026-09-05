const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Local development.
 *
 * This used to forward /zoho straight to zohoapis.in, because the browser held
 * the Zoho token and called Zoho itself. It no longer does: the token lives on
 * the server, and the app talks to /api/* instead.
 *
 * The preferred way to run locally is `netlify dev`, which serves the React
 * app and the functions together on one origin — cookies and redirects then
 * behave exactly as they do in production.
 *
 * This rule exists for the other habit: `npm start` on :3000 with `netlify dev`
 * (or `netlify functions:serve`) alongside on :8888. Without it, /api/* would
 * hit the CRA dev server, which knows nothing about functions.
 */
module.exports = function (app) {
	app.use(
		'/api',
		createProxyMiddleware({
			target: process.env.FUNCTIONS_ORIGIN || 'http://localhost:8888',
			changeOrigin: false, // keep the Host header so cookies stay first-party
			secure: false,
			logLevel: 'warn',
		}),
	);
};
